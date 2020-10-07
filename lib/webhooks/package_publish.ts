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
	repository,
	secret,
	WebhookContext,
	WebhookHandler,
	github,
	slack,
} from "@atomist/skill";
import {
	FingerprintsQuery,
	FingerprintsQueryVariables,
} from "../typings/types";
import { hash } from "../util";
import * as fs from "fs-extra";

export const handler: WebhookHandler<{
	event: string;
	name: string;
	payload: {
		"dist-tags"?: {
			latest?: string;
		};
	};
}> = async ctx => {
	const body = ctx.json;
	if (
		body.event === "package:publish" &&
		body.payload?.["dist-tags"]?.latest
	) {
		const name = body.name;
		const version = body.payload["dist-tags"].latest;
		// Run the fingerprint query to obtain existing fingerprints
		const commits = await ctx.graphql.query<
			FingerprintsQuery,
			FingerprintsQueryVariables
		>("fingerprints.graphql", {
			type: "npm-audit-dependencies",
			name,
		});
		const sha = hash(version);
		const rangeSha = hash(`^${version}`);
		const filteredCommits = commits.headCommitsWithFingerprint
			.filter(c =>
				repository.matchesFilter(
					c.repo.id,
					c.repo.org.id,
					ctx.configuration.name,
					"repoFilter",
					ctx,
				),
			)
			.filter(c =>
				c.analysis.some(a => a.sha !== sha && a.sha !== rangeSha),
			);
		for (const commit of filteredCommits) {
			await updateRepository(ctx, commit, name, version);
		}
	}
};

async function updateRepository(
	ctx: WebhookContext,
	commit: FingerprintsQuery["headCommitsWithFingerprint"][0],
	name: string,
	version: string,
): Promise<void> {
	// Clone repository
	const credential = await ctx.credential.resolve(
		secret.gitHubAppToken({
			owner: commit.repo.owner,
			repo: commit.repo.name,
			apiUrl: commit.repo.org.provider.apiUrl,
		}),
	);
	const project = await ctx.project.clone(
		repository.gitHub({
			owner: commit.repo.owner,
			repo: commit.repo.name,
			credential,
		}),
		{ detachHead: false, alwaysDeep: false },
	);

	const args = ["install", `${name}@^${version}`];

	const pj = await fs.readJson(project.path("package.json"));
	let isDev = false;
	if (pj.devDependencies[name]) {
		args.push("--save-dev");
		isDev = true;
	}

	await project.spawn("npm", args);
	await github.persistChanges(
		ctx,
		project,
		"pr",
		{
			branch: commit.branch.name,
			author: {
				login: commit.commit?.author?.login,
				name: commit.commit?.author?.name,
				email: commit.commit?.author?.emails?.[0]?.address,
			},
			defaultBranch: commit.repo.defaultBranch,
		},
		{
			branch: `atomist/npm-publish-${commit.branch.name}/${name.replace(
				/@/g,
				"",
			)}`,
			title: `Update ${name} > ${version}`,
			body: `This pull request updates the following dependency because a new version was published to the registry
			
### ${isDev ? "Development " : ""}Dependency

* ${slack.codeLine(name)} > ${slack.italic(version)}`,
		},
		{
			message: `Update ${name} > ${version}\n\n[atomist:generated]\n[atomist-skill:${ctx.skill.namespace}/${ctx.skill.name}]`,
		},
	);
}
