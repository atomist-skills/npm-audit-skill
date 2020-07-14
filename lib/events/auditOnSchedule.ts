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
    github,
    handleError,
    log,
    repository,
    secret,
    state,
    status,
} from "@atomist/skill";
import { AuditConfiguration } from "../configuration";
import {
    AuditOnScheduleSubscription,
    FingerprintsQuery,
    FingerprintsQueryVariables,
    HeadCommitByRepoQuery,
    HeadCommitByRepoQueryVariables,
    RepositoriesQuery,
    RepositoriesQueryVariables,
} from "../typings/types";
import { hash } from "../util";
import { handler as pushHandler } from "./auditOnPush";

interface AuditState {
    lastRun: number;
    excludes: string[];
}

export const handler: EventHandler<AuditOnScheduleSubscription, AuditConfiguration> = async ctx => {
    const cfg = ctx.configuration?.[0];
    const params = cfg?.parameters || {};

    // If the skill isn't configured to push changes back into the repo we don't need to run anything here
    if (params.push === "none") {
        return status.success(`Not configured to push changes`).hidden();
    }

    const auditState = await state.hydrate<AuditState>(cfg.name, ctx, { lastRun: 0, excludes: [] });
    const lastRun = auditState.lastRun;
    const threshold = Date.now() - 1000 * 60 * 60 * 24;
    if (lastRun > threshold) {
        return status.success(`Not passed the required idle time`).hidden();
    }
    auditState.lastRun = Date.now();
    await state.save(auditState, cfg.name, ctx);

    // Get all repos in this workspace
    const repos = await ctx.graphql.query<RepositoriesQuery, RepositoriesQueryVariables>("repositories.graphql");
    const requests: AuditRequest[] = repos.Repo.map(r => ({
        owner: r.owner,
        ownerId: r.org.id,
        repo: r.name,
        repoId: r.id,
        branch: r.defaultBranch,
        sha: undefined,
    }));

    // Run the fingerprint query to obtain existing fingerprints
    const commits = await ctx.graphql.query<FingerprintsQuery, FingerprintsQueryVariables>("fingerprints.graphql");
    for (const commit of commits.headCommitsWithFingerprint) {
        const request = requests.find(r => r.repoId === commit.repo.id);
        if (request) {
            request.sha = commit.analysis[0].sha;
        }
    }

    // Run the audit report
    const filteredRequests = requests
        .filter(r => !(auditState.excludes || []).includes(r.repoId))
        .filter(r => repository.matchesFilter(r.repoId, r.ownerId, ctx.configuration?.[0]?.name, "repos", ctx));
    await ctx.audit.log(`Auditing ${filteredRequests.length} repositories after applying filters`);
    for (const request of filteredRequests) {
        await ctx.audit.log(`Auditing repository ${request.owner}/${request.repo}`);
        await handleError(() => auditRepository(request, auditState, ctx));
        auditState.lastRun = Date.now();
        await state.save(auditState, cfg.name, ctx);
    }
    return status.success(`Audited ${filteredRequests.length} repositories`);
};

interface AuditRequest {
    owner: string;
    ownerId: string;
    repo: string;
    repoId: string;
    branch: string;
    sha: string;
}

async function auditRepository(
    request: AuditRequest,
    auditState: AuditState,
    ctx: EventContext<AuditOnScheduleSubscription, AuditConfiguration>,
): Promise<void> {
    const cfg = ctx.configuration?.[0]?.parameters;
    const { owner, repo, repoId, branch } = request;

    // Get package{-lock}.json from GitHub
    const credential = await ctx.credential.resolve(secret.gitHubAppToken({ owner, repo }));

    let pj;
    let pjLock;
    try {
        const id = repository.gitHub({ owner, repo, credential });
        const api = github.api(id);
        const packageResponse = (
            await api.repos.getContent({
                owner,
                repo,
                path: "package.json",
            })
        ).data;
        const packageLockResponse = (
            await api.repos.getContent({
                owner,
                repo,
                path: "package-lock.json",
            })
        ).data;
        pj = JSON.parse(Buffer.from(packageResponse.content, "base64").toString());
        pjLock = JSON.parse(Buffer.from(packageLockResponse.content, "base64").toString());
    } catch (e) {
        auditState.excludes.push(request.repoId);
        log.info(`Failed to retrieve package.json and package-lock.json from repository: ${e.message}`);
        await ctx.audit.log(`Not running npm audit on repository ${request.owner}/${request.repo}`);
        return;
    }

    // Get audit report from npmjs
    const auditData = {
        name: pj.name,
        version: pj.version,
        requires: {
            ...(pj.dependencies || {}),
            ...(cfg.ignoreDev === true ? {} : pj.devDependencies || {}),
        },
        dependencies: pjLock.dependencies,
    };
    const report = await (
        await ctx.http.request("https://registry.npmjs.org/-/npm/v1/security/audits", {
            method: "post",
            body: JSON.stringify(auditData),
            compress: true,
            headers: {
                "Content-Type": "application/json",
            },
        })
    ).json();

    // Compare audit report
    delete report.runId;
    if (hash(report) !== request.sha) {
        await ctx.audit.log(`npm audit report for ${request.owner}/${request.repo} different to existing`);
        const headCommit = await ctx.graphql.query<HeadCommitByRepoQuery, HeadCommitByRepoQueryVariables>(
            "headCommitByRepo.graphql",
            {
                branch,
                repoId,
            },
        );

        // Run npm audit fix
        await pushHandler({
            ...ctx,
            data: {
                Push: headCommit.Branch[0].commit.pushes,
            },
        });
    } else {
        await ctx.audit.log(`npm audit report for ${request.owner}/${request.repo} not different to existing`);
    }
}
