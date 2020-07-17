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
import { UpdateCheck } from "@atomist/skill/lib/github";
import * as fs from "fs-extra";
import { AuditConfiguration } from "../configuration";
import {
	AddFingerprintsMutation,
	AddFingerprintsMutationVariables,
	AuditOnPushSubscription,
} from "../typings/types";
import * as _ from "lodash";
import { hash } from "../util";

interface AuditParameters {
	project: project.Project;
	credential: secret.GitHubCredential | secret.GitHubAppCredential;
	start: string;
	check: github.Check;
	vulnerabableModules: NpmRootVulnerability[];
	actions: NpmAction[];
	advisoriesBefore: NpmAdvisory[];
	vulnerabilitiesBefore: {
		info: number;
		low: number;
		moderate: number;
		high: number;
		critical: number;
	};
	advisoriesAfter: NpmAdvisory[];
	vulnerabilitiesAfter: {
		info: number;
		low: number;
		moderate: number;
		high: number;
		critical: number;
	};
}

enum Level {
	info = 4,
	low = 3,
	moderate = 2,
	high = 1,
	critical = 0,
}

export interface NpmAuditAdvisory {
	id: number;
	module_name: string;
	vulnerable_versions: string;
	severity: "info" | "low" | "moderate" | "high" | "critical";
	title: string;
	findings: Array<{ version: string; paths: string[] }>;
	cves: string[];
	url: string;
	recommendation: string;
	overview: string;
	updated: string;
}

export interface NpmAdvisory {
	details: string;
	severity: string;
	module: string;
	id: number;
}

export interface NpmAction {
	isMajor: boolean;
	action: "install" | "update" | "review";
	module: string;
	target: string;
	depth: number;
	resolves: Array<{ dev: boolean; id: number }>;
}

export interface NpmRootVulnerability {
	id: number;
	severity: string;
	module: string;
	vulnerableModule: string;
	vulnerableVersion: string;
}

export interface NpmAuditResult {
	actions: Array<{
		isMajor: boolean;
		action: "install" | "update";
		module: string;
		target: string;
		depth: number;
		resolves: Array<{ dev: boolean; id: number }>;
	}>;
	advisories: { [id: string]: NpmAuditAdvisory };
}

type AuditStep = Step<
	EventContext<AuditOnPushSubscription, AuditConfiguration>,
	AuditParameters
>;

const SetupStep: AuditStep = {
	name: "clone repository",
	run: async (ctx, params) => {
		const push = ctx.data.Push[0];
		const repo = push.repo;

		if (push.branch.startsWith("atomist/")) {
			return status.failure(`Ignore generated branch`).hidden();
		}

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

		if (!push.branch.startsWith("atomist/")) {
			const gs = await git.status(params.project);
			params.check = await github.createCheck(ctx, params.project.id, {
				sha: gs.sha,
				name: ctx.skill.name,
				title: "npm audit",
				body: `Running \`npm audit\``,
			});
		}

		return status.success();
	},
};

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
		const result = await params.project.spawn(
			"npm",
			["audit", ...args, "--json"],
			{
				log: captureLog,
				logCommand: false,
			},
		);
		const auditReport = sliceReport(captureLog.log);
		params.vulnerabilitiesBefore = JSON.parse(
			auditReport,
		)?.metadata?.vulnerabilities;

		await storeFingerprint(auditReport, ctx, params);

		if (!push.branch.startsWith("atomist/npm-audit-")) {
			if (result.status === 0) {
				await params.check.update({
					conclusion: "success",
					body: `\`npm audit\` found no security vulnerabilities.

\`$ npm audit ${args.join(" ")}\``,
				});
				return status.success(
					`\`npm audit\` found no security vulnerabilities on [${repo.owner}/${repo.name}](${repo.url})`,
				);
			} else {
				const excludedPackages = cfg.excludedPackages || [];
				const excludedAdvisoryIds = cfg.excludedAdvisoryIds || [];
				const level = cfg.level;
				const report = parseNpmAuditResult(auditReport);
				params.actions = report.actions
					.filter(a => !excludedPackages.includes(a.module))
					.filter(a => (a.isMajor === true && cfg.force) || !a.isMajor)
					.filter(a => a.action !== "review");
				params.advisoriesBefore = report.advisories;
				params.vulnerabableModules = report.roots
					.filter(
						a =>
							!excludedPackages.includes(a.module) &&
							!excludedAdvisoryIds.includes(a.id.toString()),
					)
					.filter(filterAdvisoryByLevel(level));

				const includedAdvisories = report.advisories
					.filter(
						a =>
							!excludedPackages.includes(a.module) &&
							!excludedAdvisoryIds.includes(a.id.toString()),
					)
					.filter(filterAdvisoryByLevel(level));
				const excludedAdvisories = report.advisories
					.filter(
						a =>
							excludedPackages.includes(a.module) ||
							excludedAdvisoryIds.includes(a.id.toString()),
					)
					.filter(filterAdvisoryByLevel(level));

				const vulSummary = formatVulnerabilities(params.vulnerabilitiesBefore);
				await params.check.update({
					conclusion:
						includedAdvisories.length > 0 ? "action_required" : "neutral",
					body: `\`npm audit\` found ${vulSummary.msg} security ${
						vulSummary.count === 1 ? "vulnerability" : "vulnerabilities"
					}.

\`$ npm audit ${args.join(" ")}\`

---

Following security ${
						includedAdvisories.length === 1 ? "advisory was" : "advisories were"
					} found:
${_.map(_.groupBy(includedAdvisories, "module"), formatAdvisory).join(
	"\n---\n",
)}${
						excludedAdvisories.length > 0
							? `\n---\n\nFollowing security ${
									excludedAdvisories.length === 1 ? "advisory" : "advisories"
							  } were excluded due to configuration:\n${_.map(
									_.groupBy(excludedAdvisories, "module"),
									formatAdvisory,
							  ).join("\n---\n")}`
							: ""
					}`,
					annotations: await mapVulnerableModulesToAnnotation(
						params.vulnerabableModules,
						params.project,
					),
				});

				return status.success(
					`\`npm audit\` found security vulnerabilities on [${repo.owner}/${repo.name}](${repo.url})`,
				);
			}
		}
		return status.success(
			`Recorded \`npm audit\` report on [${repo.owner}/${repo.name}](${repo.url})`,
		);
	},
};

const NpmInstallStep: AuditStep = {
	name: "npm install",
	runWhen: async (ctx, params) => {
		const pushCfg = ctx.configuration[0]?.parameters?.push;
		return (
			!!pushCfg &&
			pushCfg !== "none" &&
			params.actions?.length > 0 &&
			!ctx.data.Push?.[0]?.branch.startsWith("atomist/")
		);
	},
	run: async (ctx, params) => {
		const opts = { env: { ...process.env, NODE_ENV: "development" } };
		let result;
		if (await fs.pathExists(params.project.path("package-lock.json"))) {
			result = await params.project.spawn(
				"npm",
				["ci", "--ignore-scripts", "--no-audit", "--no-fund"],
				opts,
			);
		} else {
			result = await params.project.spawn(
				"npm",
				["install", "--ignore-scripts", "--no-audit", "--no-fund"],
				opts,
			);
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
			!ctx.data.Push?.[0]?.branch.startsWith("atomist/")
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
				args.push("--ignore-scripts", "--no-audit", "--no-fund");
			} else if (action.action === "update") {
				args.push(
					"update",
					action.module,
					"--depth",
					action.depth,
					"--ignore-scripts",
					"--no-audit",
					"--no-fund",
				);
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

		const auditReport = sliceReport(captureLog.log);
		const report = parseNpmAuditResult(auditReport);

		const excludedPackages = cfg.excludedPackages || [];
		const excludedAdvisoryIds = cfg.excludedAdvisoryIds || [];
		const includedAdvisories = report.advisories
			.filter(
				a =>
					!excludedPackages.includes(a.module) &&
					!excludedAdvisoryIds.includes(a.id.toString()),
			)
			.filter(filterAdvisoryByLevel(cfg.level));
		params.advisoriesAfter = includedAdvisories;
		params.vulnerabilitiesAfter = JSON.parse(
			auditReport,
		)?.metadata?.vulnerabilities;

		return status.success(
			`\`npm audit\` fixed security vulnerabilities on [${repo.owner}/${repo.name}](${repo.url})`,
		);
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
			!ctx.data.Push?.[0]?.branch.startsWith("atomist/")
		);
	},
	run: async (ctx, params) => {
		const cfg = ctx.configuration?.[0]?.parameters || {};
		const pushCfg = cfg.push;
		const push = ctx.data.Push[0];
		const repo = push.repo;

		const fixedAdvisoryIds = _.uniq(
			_.flatten(params.actions.map(a => a.resolves.map(r => r.id))),
		);
		const fixedAdvisories = params.advisoriesBefore.filter(a =>
			fixedAdvisoryIds.includes(a.id),
		);

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
				branch: `atomist/npm-audit-${push.branch}`,
				title: "npm audit fixes",
				body: `${formatVulnerabilitiesForPrBody(
					params.vulnerabilitiesBefore,
					params.vulnerabilitiesAfter,
					(await git.status(params.project)).sha,
				)}
                
\`npm audit fix\` updated the following npm packages: 

${_.uniq(
	_.sortBy(params.actions, "module").map(
		a => ` * ${slack.codeLine(a.module)} > ${slack.italic(a.target)}`,
	),
).join("\n")}

---

## <a id="fixed-vul">Fixed vulnerabilities</a>

Following security ${
					fixedAdvisories.length === 1
						? "vulnerability is"
						: "vulnerabilities are"
				} fixed:
${_.map(_.groupBy(fixedAdvisories, "module"), formatAdvisory).join("\n---\n")}${
					params.advisoriesAfter.length > 0
						? `
--- 

## <a id="open-vul">Open vulnerabilities</a>

Following security ${
								params.advisoriesAfter.length === 1
									? "vulnerability remains open and needs"
									: "vulnerabilities remain open and need"
						  } manual review:
${_.map(_.groupBy(params.advisoriesAfter, "module"), formatAdvisory).join(
	"\n---\n",
)}`
						: ""
				}`,
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
		return (
			(await git.status(params.project)).isClean &&
			!ctx.data.Push?.[0]?.branch.startsWith("atomist/")
		);
	},
	run: async (ctx, params) => {
		const push = ctx.data.Push[0];
		await github.closePullRequests(
			ctx,
			params.project,
			push.branch,
			`atomist/npm-audit-${push.branch}`,
			"Closing pull request because security vulnerabilities were fixed in base branch",
		);
		return undefined;
	},
};

export const handler: EventHandler<
	AuditOnPushSubscription,
	AuditConfiguration
> = async ctx => {
	return runSteps({
		context: ctx,
		steps: [
			SetupStep,
			NpmAuditStep,
			NpmInstallStep,
			NpmAuditFixStep,
			ClosePrStep,
			PushStep,
		],
	});
};

function parseNpmAuditResult(
	npmAuditOutput: string,
): {
	advisories: NpmAdvisory[];
	actions: NpmAction[];
	roots: NpmRootVulnerability[];
} {
	let results: NpmAuditResult;
	try {
		results = JSON.parse(npmAuditOutput);
	} catch (e) {
		log.error(
			`Failed to parse npm audit output '${npmAuditOutput}': ${e.message}`,
		);
		return { advisories: [], actions: [], roots: [] };
	}

	return {
		advisories: _.orderBy(
			_.map(results.advisories, v => {
				const module = v.module_name;
				let details = `[${v.title}](${v.url})`;
				if (v.recommendation) {
					details = `${details} ${slack.italic(
						v.recommendation.trim().replace(/\.$/, ""),
					)}`;
				}
				details = `${details}\n${v.severity} - ${slack.codeLine(
					v.vulnerable_versions,
				)}`;
				if (!!v.cves && v.cves.length > 0) {
					details =
						`${details} - ` +
						v.cves
							.map(c => `[${c}](https://nvd.nist.gov/vuln/detail/${c})`)
							.join(" ");
				}
				if (results.actions.some(a => a.resolves.some(r => r.id === v.id))) {
					details = `${details} - automatic fix available`;
				}
				if (v.overview) {
					// details = `${details}\n\n${v.overview}\n\n`;
				}
				if (!!v.findings && v.findings.length > 0) {
					const findings = v.findings.map(
						f =>
							`\n<details>
  <summary><code>${v.module_name}@${f.version}</code> - ${
								f.paths.length
							} vulnerable ${f.paths.length === 1 ? "path" : "paths"}</summary>
${(f.paths.sort() || [])
	.map(p => `  <li><code>${p.replace(/>/g, " > ")}</code></li>`)
	.join("\n")}
</details>`,
					);
					details = `${details}\n${findings.join("")}\n`;
				}
				const severity = v.severity;
				const id = v.id;
				return { id, module, details, severity, updated: v.updated };
			}),
			[a => Level[a.severity], "updated"],
			["asc", "desc"],
		),
		actions: results.actions,
		roots: _.flatten(
			_.map(results.advisories, v => {
				return _.flatten(
					v.findings.map(f =>
						f.paths.map(p => ({
							id: v.id,
							severity: v.severity,
							module: p.split(">")[0],
							vulnerableModule: p.split(">").slice(-1)[0],
							vulnerableVersion: f.version,
						})),
					),
				);
			}),
		),
	};
}

function formatAdvisory(ad: NpmAdvisory[], key: string) {
	return `\n### ${key}\n\n${ad.map(a => a.details).join("\n\n")}`;
}

function formatVulnerabilities(
	vul: AuditParameters["vulnerabilitiesAfter"],
): { parts: string[]; msg: string; count: number } {
	const parts = [];
	let count = 0;
	if (vul.critical > 0) {
		parts.push(`${vul.critical} critical`);
		count += vul.critical;
	}
	if (vul.high > 0) {
		parts.push(`${vul.high} high`);
		count += vul.high;
	}
	if (vul.moderate > 0) {
		parts.push(`${vul.moderate} moderate`);
		count += vul.moderate;
	}
	if (vul.low > 0) {
		parts.push(`${vul.low} low`);
		count += vul.low;
	}
	if (vul.info > 0) {
		parts.push(`${vul.info} info`);
		count += vul.info;
	}
	return {
		msg: parts.join(", ").replace(/, ([^,]*)$/, " and $1"),
		count,
		parts,
	};
}

function formatVulnerabilitiesForPrBody(
	before: AuditParameters["vulnerabilitiesBefore"],
	after: AuditParameters["vulnerabilitiesAfter"],
	sha: string,
): string {
	const beforeStats = formatVulnerabilities(before);
	const diffStats = formatVulnerabilities({
		critical: before.critical - after.critical,
		high: before.high - after.high,
		moderate: before.moderate - after.moderate,
		low: before.low - after.low,
		info: before.info - after.info,
	});
	const afterStats = formatVulnerabilities(after);
	if (afterStats.parts.length === 0) {
		return `This pull request fixes all [${beforeStats.msg} security ${
			beforeStats.count === 1 ? "vulnerability" : "vulnerabilities"
		}](#user-content-fixed-vul) open on ${sha.slice(0, 7)}.`;
	} else {
		return `This pull request fixes [${diffStats.msg} security ${
			diffStats.parts.length === 1 ? "vulnerability" : "vulnerabilities"
		}](#user-content-fixed-vul) open on ${sha.slice(0, 7)} but [${
			afterStats.msg
		} ${
			afterStats.count === 1
				? "vulnerability](#user-content-open-vul) remains open and needs"
				: "vulnerabilities](#user-content-open-vul) remain open and need"
		} manual review.`;
	}
}

async function mapVulnerableModulesToAnnotation(
	roots: NpmRootVulnerability[],
	project: project.Project,
): Promise<Array<UpdateCheck["annotations"][0]>> {
	const annotations: Array<UpdateCheck["annotations"][0]> = [];
	const pj = (await fs.readFile(project.path("package.json"))).toString();
	_.forEach(_.groupBy(roots, "module"), (v, k) => {
		const ix = pj.indexOf(k);
		if (ix > 0) {
			const lineNumber = pj.substring(0, ix).split("\n").length;
			const directPaths = v.filter(p => p.vulnerableModule === p.module);
			const transitivePath = _.uniq(
				v
					.filter(p => p.vulnerableModule !== p.module)
					.map(p => `${p.vulnerableModule}@${p.vulnerableVersion}`),
			);
			let text = ``;
			if (directPaths.length > 0 && transitivePath.length === 0) {
				text = `${k} is vulnerable`;
			} else if (directPaths.length > 0 && transitivePath.length > 0) {
				text = `${k} is vulnerable and introduces ${
					transitivePath.length === 0 ? "a vulnerability" : "vulnerabilities"
				} through its transitive dependencies to ${transitivePath
					.join(", ")
					.replace(/, ([^,]*)$/, " and $1")}`;
			} else if (directPaths.length === 0 && transitivePath.length > 0) {
				text = `${k} introduces ${
					transitivePath.length === 0 ? "a vulnerability" : "vulnerabilities"
				} through its transitive dependencies to ${transitivePath
					.join(", ")
					.replace(/, ([^,]*)$/, " and $1")}`;
			}
			annotations.push({
				path: "package.json",
				startLine: lineNumber,
				endLine: lineNumber,
				message: text,
				annotationLevel: "warning",
			});
		}
	});

	return _.sortBy(annotations, "startLine");
}

/**
 * Helper to fix console output that gets poised with node debugger
 * messages at the start and end
 */
function sliceReport(report: string): string {
	let tmp = report;
	tmp = tmp.slice(tmp.indexOf("{"));
	tmp = tmp.slice(0, tmp.lastIndexOf("}") + 1);
	return tmp;
}

function filterAdvisoryByLevel(
	level: string,
): (ad: Pick<NpmAdvisory, "severity">) => boolean {
	if (!level) {
		return () => true;
	}
	return ad => Level[level] >= Level[ad.severity];
}

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
	await ctx.graphql.mutate<
		AddFingerprintsMutation,
		AddFingerprintsMutationVariables
	>("addFingerprints.graphql", {
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
