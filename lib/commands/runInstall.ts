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
	CommandHandler,
	prompt,
	repository,
	slack,
	status,
	secret,
	github,
} from "@atomist/skill";
import * as fs from "fs-extra";
import {
	FingerprintsQuery,
	FingerprintsQueryVariables,
} from "../typings/types";
import { AuditConfiguration } from "../configuration";

export const handler: CommandHandler<AuditConfiguration> = async ctx => {
	const parameters = await prompt.configurationWithParameters<
		{
			package: string;
			version?: string;
			repo?: string;
			repos?: string;
			save?: string;
		},
		AuditConfiguration
	>(ctx, {
		repos: { required: false },
		repo: { required: false },
		package: {},
		version: { required: false },
		save: { required: false },
	});
	const cfg = parameters.configuration;

	const requestedRepositories: Array<
		repository.RepositoryId & { repoId: string; ownerId: string }
	> = [];
	if (!parameters.repos && !parameters.repo) {
		requestedRepositories.push(
			...(await repository.linkedRepositories(ctx)),
		);
		if (requestedRepositories.length === 0) {
			await ctx.message.respond(
				slack.infoMessage(
					"npm Install",
					"No repository provided.\n\nEither run this command from a linked channel, provide a regular expression to match repository slugs (eg. `--repos='example-org\\/.*'`) or provide a repository slug with the `--repo` parameter.",
					ctx,
				),
			);
			return status.success("No repository provided").hidden();
		}
	} else {
		// Get all repos in this workspace
		const repositories = await ctx.graphql.query<
			FingerprintsQuery,
			FingerprintsQueryVariables
		>("fingerprints.graphql", {
			name: parameters.package,
			type: "npm-dependencies",
		});
		requestedRepositories.push(
			...repositories?.headCommitsWithFingerprint
				.filter(r => {
					const slug = `${r.repo.owner}/${r.repo.name}`;
					if (parameters.repo) {
						return parameters.repo === slug;
					} else {
						const exp = new RegExp(parameters.repos);
						return exp.test(slug);
					}
				})
				.filter(r =>
					r.analysis.some(a => a.name === parameters.package),
				)
				.map(r => ({
					owner: r.repo.owner,
					repo: r.repo.name,
					apiUrl: r.repo.org?.provider?.apiUrl,
					branch: r.repo.defaultBranch,
					type: repository.RepositoryProviderType.GitHubCom,
					repoId: r.repo.id,
					ownerId: r.repo.org?.id,
				})),
		);
	}

	const filteredRepositories = requestedRepositories.filter(r =>
		repository.matchesFilter(r.repoId, r.ownerId, cfg.name, "repos", ctx),
	);

	const version = parameters.version || "latest";
	if (filteredRepositories.length === 0) {
		await ctx.message.respond(
			slack.infoMessage(
				"npm Install",
				"No repository selected after applying repository filter",
				ctx,
			),
		);
		return status
			.success("No repository selected after applying repository filter")
			.hidden();
	}

	for (const repo of filteredRepositories) {
		const credential = await ctx.credential.resolve(
			secret.gitHubAppToken({ owner: repo.owner, repo: repo.repo }),
		);
		const project = await ctx.project.clone(
			repository.gitHub({ ...repo, credential }),
		);
		const pj = await fs.readJson(project.path("package.json"));
		const result = await project.spawn("npm", [
			"install",
			`${parameters.package}@${version}`,
			...(pj.devDependencies?.[parameters.package] ? ["--save-dev"] : []),
			...(parameters.save ? [`--save-${parameters.save}`] : []),
		]);
		if (result.status === 0) {
			const message = `Update ${parameters.package} > ${version}`;
			await github.persistChanges(
				ctx,
				project,
				cfg.parameters.push,
				{
					branch: repo.branch,
					defaultBranch: repo.branch,
					author: {
						login: undefined,
						email: undefined,
						name: undefined,
					},
				},
				{
					branch: `atomist/npm-install/${parameters.package.replace(
						/@/g,
						"",
					)}`,
					title: message,
					body: `This pull request updates the following npm dependency

 * ${slack.codeLine(parameters.package)} > ${slack.italic(version)}`,
					labels: cfg.parameters.labels,
					assignReviewer: true,
					reviewers: [],
				},
				{
					message,
				},
			);
		}
	}

	return status.success(
		`Installed ${slack.codeLine(`${parameters.package}@${version}`)} on ${
			filteredRepositories.length
		} ${filteredRepositories.length === 1 ? "repository" : "repositories"}`,
	);
};
