/*
 * Copyright © 2020 Atomist, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import {
    EventContext,
    EventHandler,
    git,
    github,
    project,
    repository,
    runSteps,
    secret,
    Step,
    status,
    log,
    slack,
    childProcess,
} from "@atomist/skill";
import * as fs from "fs-extra";
import { AuditConfiguration } from "../configuration";
import { AddFingerprintsMutation, AddFingerprintsMutationVariables, AuditOnPushSubscription } from "../typings/types";
import * as _ from "lodash";
import { hash } from "../util";

interface AuditParameters {
    project: project.Project;
    credential: secret.GitHubCredential | secret.GitHubAppCredential;
    start: string;
    check: github.Check;
    actions: NpmAction[];
    vulnerabilitiesBefore: {
        info: number;
        low: number;
        moderate: number;
        high: number;
        critical: number;
    };
    vulnerabilitiesAfter: {
        info: number;
        low: number;
        moderate: number;
        high: number;
        critical: number;
    };
}

type AuditStep = Step<EventContext<AuditOnPushSubscription, AuditConfiguration>, AuditParameters>;

const SetupStep: AuditStep = {
    name: "clone repository",
    run: async (ctx, params) => {
        const push = ctx.data.Push[0];
        const repo = push.repo;

        await ctx.audit.log(`Starting npm audit on ${repo.owner}/${repo.name}`);

        params.credential = await ctx.credential.resolve(
            secret.gitHubAppToken({
                owner: repo.owner,
                repo: repo.name,
                apiUrl: repo.org.provider.apiUrl,
            }),
        );

        if (ctx.name === "auditOnPush") {
            params.project = await ctx.project.load(
                repository.gitHub({
                    owner: repo.owner,
                    repo: repo.name,
                    credential: params.credential,
                    branch: push.branch,
                }),
                process.env.ATOMIST_HOME,
            );
        } else {
            params.project = await ctx.project.clone(
                repository.gitHub({
                    owner: repo.owner,
                    repo: repo.name,
                    credential: params.credential,
                    branch: push.branch,
                }),
                { detachHead: false, alwaysDeep: false },
            );
        }

        if (!(await fs.pathExists(params.project.path("package-lock.json")))) {
            return status.failure("Ignore non-npm project").hidden();
        }

        if (!push.branch.startsWith("npm-audit-")) {
            const gs = await git.status(params.project);
            params.check = await github.createCheck(ctx, params.project.id, {
                sha: gs.sha,
                name: ctx.skill.name,
                title: "npm audit",
                body: `Running \`npm audit\``,
            });
        }

        return undefined;
    },
};

async function storeFingerprint(
    captureLog: string,
    ctx: EventContext<AuditOnPushSubscription, AuditConfiguration>,
    params: AuditParameters,
) {
    const push = ctx.data.Push[0];
    // fingerprints
    const npmAuditReport = JSON.parse(captureLog);
    delete npmAuditReport.runId;
    const fingerprint = hash(npmAuditReport);
    await ctx.graphql.mutate<AddFingerprintsMutation, AddFingerprintsMutationVariables>("addFingerprints.graphql", {
        isDefaultBranch: push.branch === push.repo.defaultBranch,
        type: "npm-audit-report",
        branchId: push.toBranch.id,
        repoId: push.repo.id,
        sha: (await git.status(params.project)).sha,
        additions: [
            {
                data: JSON.stringify({ audit: npmAuditReport }),
                name: "npm-audit-report",
                sha: fingerprint,
            },
        ],
    });
}
const NpmAuditStep: AuditStep = {
    name: "run npm audit",
    run: async (ctx, params) => {
        const push = ctx.data.Push[0];
        const repo = push.repo;
        const cfg = ctx.configuration?.[0]?.parameters || {};
        const args = [];

        if (cfg.ignoreDev) {
            args.push("--production");
        }

        const captureLog = childProcess.captureLog();
        const result = await params.project.spawn("npm", ["audit", ...args, "--json"], {
            log: captureLog,
            logCommand: false,
        });
        params.vulnerabilitiesBefore = JSON.parse(captureLog.log)?.metadata?.vulnerabilities;

        await storeFingerprint(captureLog.log, ctx, params);

        if (!push.branch.startsWith("npm-audit-")) {
            if (result.status === 0) {
                await params.check.update({
                    conclusion: "success",
                    body: `\`npm audit\` found no security advisories.

\`$ npm audit ${args.join(" ")}\``,
                });
                return status.success(
                    `\`npm audit\` found no security advisories on [${repo.owner}/${repo.name}](${repo.url})`,
                );
            } else {
                const exclusions = cfg.exclusions || [];
                const level = cfg.level;
                const report = parseNpmAuditResult(captureLog.log);
                params.actions = report.actions
                    .filter(a => !exclusions.includes(a.module))
                    .filter(a => (a.isMajor === true && cfg.force) || !a.isMajor);

                const includedAdvisories = report.advisories
                    .filter(a => !exclusions.includes(a.module))
                    .filter(filterAdvisoryByLevel(level));
                const excludedAdvisories = report.advisories
                    .filter(a => exclusions.includes(a.module))
                    .filter(filterAdvisoryByLevel(level));
                const formatAdvisory = (ad: NpmAdvisory[], key: string) =>
                    `\n### ${key}\n\n${ad.map(a => a.details).join("\n\n")}`;

                await params.check.update({
                    conclusion: includedAdvisories.length > 0 ? "action_required" : "neutral",
                    body: `\`npm audit\` found security advisories.

\`$ npm audit ${args.join(" ")}\`

---

Following security ${includedAdvisories.length === 1 ? "advisory" : "advisories"} were found:
${_.map(_.groupBy(includedAdvisories, "module"), formatAdvisory).join("\n---\n")}${
                        excludedAdvisories.length > 0
                            ? `\n---\n\nFollowing security ${
                                  excludedAdvisories.length === 1 ? "advisory" : "advisories"
                              } were excluded due to configuration:\n${_.map(
                                  _.groupBy(excludedAdvisories, "module"),
                                  formatAdvisory,
                              ).join("\n---\n")}`
                            : ""
                    }`,
                });

                return status.success(
                    `\`npm audit\` found security advisories on [${repo.owner}/${repo.name}](${repo.url})\``,
                );
            }
        }
        return status.success(`Recorded \`npm audit\` report on [${repo.owner}/${repo.name}](${repo.url})`);
    },
};

enum Level {
    info = 4,
    low = 3,
    moderate = 2,
    high = 1,
    critical = 0,
}

function filterAdvisoryByLevel(level: string): (ad: NpmAdvisory) => boolean {
    if (!level) {
        return () => true;
    }
    return ad => Level[level] >= Level[ad.severity];
}

export interface NpmAuditAdvisory {
    module_name: string;
    vulnerable_versions: string;
    severity: "info" | "low" | "moderate" | "high" | "critical";
    title: string;
    findings: Array<{ version: string; paths: string[] }>;
    cves: string[];
    url: string;
    recommendation: string;
    updated: string;
}

export interface NpmAdvisory {
    details: string;
    severity: string;
    module: string;
}

export interface NpmAction {
    isMajor: boolean;
    action: "install" | "update" | "review";
    module: string;
    target: string;
    depth: number;
    resolves: Array<{ dev: boolean }>;
}

export interface NpmAuditResult {
    actions: Array<{
        isMajor: boolean;
        action: "install" | "update";
        module: string;
        target: string;
        depth: number;
        resolves: Array<{ dev: boolean }>;
    }>;
    advisories: { [id: string]: NpmAuditAdvisory };
}

function parseNpmAuditResult(npmAuditOutput: string): { advisories: NpmAdvisory[]; actions: NpmAction[] } {
    let results: NpmAuditResult;
    try {
        results = JSON.parse(npmAuditOutput);
    } catch (e) {
        log.error(`Failed to parse npm audit output '${npmAuditOutput}': ${e.message}`);
        return { advisories: [], actions: [] };
    }

    return {
        advisories: _.orderBy(
            _.map(results.advisories, v => {
                const module = v.module_name;
                let details = `[${v.title}](${v.url})`;
                if (v.recommendation) {
                    details = `${details} ${slack.italic(v.recommendation.trim())}`;
                }
                details = `${details}\n${slack.italic(v.severity)} - ${slack.codeLine(v.vulnerable_versions)}`;
                if (!!v.cves && v.cves.length > 0) {
                    details =
                        `${details} - ` + v.cves.map(c => `[${c}](https://nvd.nist.gov/vuln/detail/${c})`).join(" ");
                }
                if (!!v.findings && v.findings.length > 0) {
                    const findings = v.findings.map(
                        f =>
                            `\n  - ${slack.codeLine(`${v.module_name}:${f.version}`)}: ${(f.paths.sort() || [])
                                .map(p => `\n    - ${slack.codeLine(p)}`)
                                .join("")}`,
                    );
                    details = `${details} ${findings.join("")}`;
                }
                const severity = v.severity;
                return { module, details, severity, updated: v.updated };
            }),
            [a => Level[a.severity], "updated"],
            ["asc", "desc"],
        ),
        actions: results.actions,
    };
}

const NpmInstallStep: AuditStep = {
    name: "npm install",
    runWhen: async (ctx, params) => {
        const pushCfg = ctx.configuration[0]?.parameters?.push;
        return (
            !!pushCfg &&
            pushCfg !== "none" &&
            params.actions?.length > 0 &&
            !ctx.data.Push?.[0]?.branch.startsWith("npm-audit-")
        );
    },
    run: async (ctx, params) => {
        const opts = { env: { ...process.env, NODE_ENV: "development" } };
        let result;
        if (await fs.pathExists(params.project.path("package-lock.json"))) {
            result = await params.project.spawn("npm", ["ci"], opts);
        } else {
            result = await params.project.spawn("npm", ["install"], opts);
        }

        if (result.status !== 0) {
            return status.failure("`npm install` failed");
        }
        return undefined;
    },
};

const NpmAuditFixStep: AuditStep = {
    name: "npm audit fix",
    runWhen: async (ctx, params) => {
        const pushCfg = ctx.configuration[0]?.parameters?.push;
        return (
            !!pushCfg &&
            pushCfg !== "none" &&
            params.actions?.length > 0 &&
            !ctx.data.Push?.[0]?.branch.startsWith("npm-audit-")
        );
    },
    run: async (ctx, params) => {
        const push = ctx.data.Push[0];
        const repo = push.repo;
        const cfg = ctx.configuration?.[0]?.parameters || {};

        for (const action of params.actions) {
            const args = [];
            if (action.action === "install") {
                args.push("install", `${action.module}@${action.target}`);
                if (!action.resolves.some(r => !r.dev)) {
                    args.push("--save-dev");
                }
            } else if (action.action === "update") {
                args.push("update", action.module, "--depth", action.depth);
            } else {
                continue;
            }
            const result = await params.project.spawn("npm", args);
            if (result.status !== 0) {
                return status.failure(`\`npm audit fix\` failed on ${action.module}`);
            }
        }

        const args = [];

        if (cfg.ignoreDev) {
            args.push("--production");
        }

        const captureLog = childProcess.captureLog();
        await params.project.spawn("npm", ["audit", ...args, "--json"], {
            log: captureLog,
            logCommand: false,
        });
        params.vulnerabilitiesAfter = JSON.parse(captureLog.log)?.metadata?.vulnerabilities;

        return status.success(`\`npm audit\` fixed security advisories on [${repo.owner}/${repo.name}](${repo.url})\``);
    },
};

const PushStep: AuditStep = {
    name: "push",
    runWhen: async (ctx, params) => {
        const pushCfg = ctx.configuration[0]?.parameters?.push;
        return (
            !!pushCfg &&
            pushCfg !== "none" &&
            !(await git.status(params.project)).isClean &&
            !ctx.data.Push?.[0]?.branch.startsWith("npm-audit-")
        );
    },
    run: async (ctx, params) => {
        const cfg = ctx.configuration?.[0]?.parameters || {};
        const pushCfg = cfg.push;
        const push = ctx.data.Push[0];
        const repo = push.repo;

        return github.persistChanges(
            ctx,
            params.project,
            pushCfg,
            {
                branch: push.branch,
                defaultBranch: repo.defaultBranch,
                author: {
                    login: push.after.author?.login,
                    name: push.after.author?.name,
                    email: push.after.author?.emails?.[0]?.address,
                },
            },
            {
                branch: `npm-audit-${push.branch}`,
                title: "npm audit fixes",
                body: `Running \`npm audit fix\` updated the following npm packages: 

${_.sortBy(
    params.actions.filter(a => a.action !== "review"),
    "module",
)
    .map(a => ` * ${slack.codeLine(a.module)} -> ${slack.italic(a.target)}`)
    .join("\n")}

${formatVulnerabilities(params.vulnerabilitiesAfter)} Review the [check for more information](${
                    params.check.data.html_url
                }) on fixed vulnerabilities.

---`,
                labels: cfg.labels,
            },
            {
                message: `npm audit fixes\n\n[atomist:generated]\n[atomist-skill:${ctx.skill.namespace}/${ctx.skill.name}]`,
            },
        );
    },
};

const ClosePrStep: AuditStep = {
    name: "close pr",
    runWhen: async (ctx, params) => {
        return (await git.status(params.project)).isClean && !ctx.data.Push?.[0]?.branch.startsWith("npm-audit-");
    },
    run: async (ctx, params) => {
        const push = ctx.data.Push[0];
        await github.closePullRequests(
            ctx,
            params.project,
            push.branch,
            `npm-audit-${push.branch}`,
            "Closing pull request because security advisories have been fixed in base branch",
        );
        return undefined;
    },
};

function formatVulnerabilities(vul: AuditParameters["vulnerabilitiesAfter"]): string {
    const parts = [];
    let count = 0;
    if (vul.critical > 0) {
        parts.push(`${vul.critical} critical`);
        count += vul.critical;
    }
    if (vul.high > 0) {
        parts.push(`${vul.high} high`);
        count += vul.critical;
    }
    if (vul.moderate > 0) {
        parts.push(`${vul.moderate} moderate`);
        count += vul.critical;
    }
    if (vul.low > 0) {
        parts.push(`${vul.low} low`);
        count += vul.critical;
    }
    if (vul.info > 0) {
        parts.push(`${vul.info} info`);
        count += vul.critical;
    }
    if (parts.length === 0) {
        return `All known security vulnerabilities have been addressed with this pull request!`;
    } else {
        return `${parts.join(", ")} security ${
            count === 1 ? "vulnerability remains open and needs" : "vulnerabilities remain open and need"
        } manual review.`;
    }
}

export const handler: EventHandler<AuditOnPushSubscription, AuditConfiguration> = async ctx => {
    return runSteps({
        context: ctx,
        steps: [SetupStep, NpmAuditStep, NpmInstallStep, NpmAuditFixStep, ClosePrStep, PushStep],
    });
};
