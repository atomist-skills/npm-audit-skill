/*
 * Copyright © 2021 Atomist, Inc.
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
	Category,
	parameter,
	ParameterType,
	ParameterVisibility,
	resourceProvider,
	skill,
} from "@atomist/skill";

import { AuditConfiguration } from "./lib/configuration";

export const Skill = skill<AuditConfiguration & { repos: any; schedule: any }>({
	name: "npm-vulnerability-scanner-skill",
	namespace: "atomist",
	description: "Fix security vulnerabilities and update npm dependencies",
	displayName: "npm Vulnerability Scanner",
	categories: [Category.CodeMaintenance, Category.DevSecOps],
	iconUrl:
		"https://raw.githubusercontent.com/atomist-skills/npm-vulnerability-scanner-skill/main/docs/images/icon.svg",

	containers: {
		npm: {
			image: "gcr.io/atomist-container-skills/npm-vulnerability-scanner-skill",
			resources: {
				limit: {
					cpu: 2,
					memory: 5000,
				},
				request: {
					cpu: 2,
					memory: 5000,
				},
			},
		},
	},

	resourceProviders: {
		github: resourceProvider.gitHub({ minRequired: 1 }),
	},

	parameters: {
		level: {
			type: ParameterType.SingleChoice,
			displayName: "Severity level",
			description:
				"Select the severity level that will cause checks to fail.",
			options: [
				{
					text: "Any",
					value: "any",
				},
				{
					text: "Moderate or worse",
					value: "moderate",
				},
				{
					text: "High or worse",
					value: "high",
				},
				{
					text: "Critical",
					value: "critical",
				},
			],
			required: true,
		},
		includeDev: {
			type: ParameterType.Boolean,
			displayName: "Development dependencies",
			description: "Select to include `devDependencies` in the scan.",
			required: false,
			defaultValue: true,
		},
		excludedPackages: {
			type: ParameterType.StringArray,
			displayName: "Packages to exclude",
			description: "Enter the npm package names you want to exclude.",
			required: false,
		},
		excludedAdvisoryIds: {
			type: ParameterType.StringArray,
			displayName: "Advisories to exclude",
			description:
				"Enter the npm advisories you want to exclude using their CVE IDs.",
			required: false,
		},
		push: parameter.pushStrategy({
			displayName: "Vulnerability fixes",
			description:
				"Select how and when fixes should be committed back into the repository.",
			options: [
				{
					text: "Do not fix detected vulnerabilities",
					value: "none",
				},
			],
			defaultValue: "none",
			required: true,
		}),
		force: {
			type: ParameterType.Boolean,
			displayName: "Semver-major updates",
			description:
				"Select to install semver-major updates to top-level dependencies.",
			required: false,
		},
		labels: {
			type: ParameterType.StringArray,
			displayName: "Pull request labels",
			description:
				"Add labels to new pull requests created by this skill.",
			required: false,
		},
		updatePush: parameter.pushStrategy({
			displayName: "Dependency updates",
			description:
				"Select how and when dependency updates should be committed back into the repository.",
			options: [
				{
					text: "Do not update dependencies",
					value: "none",
				},
			],
			required: true,
			defaultValue: "none",
		}),
		updateLabels: {
			type: ParameterType.StringArray,
			displayName: "Pull request labels",
			description:
				"Add labels to new pull requests created by this skill.",
			required: false,
		},
		/**webhook: {
			type: ParameterType.Webhook,
			displayName: "npmjs.com webhook",
			description:
				"npmjs.com webhook as described in the [documentation](https://blog.npmjs.org/post/145260155635/introducing-hooks-get-notifications-of-npm)",
			minRequired: 0,
			required: false,
		},
		secret: {
			type: ParameterType.String,
			displayName: "npmjs.com webhook secret",
			description:
				"Secret to use to validate incoming npmjs.com registry events",
			required: false,
		},*/
		repos: parameter.repoFilter(),
		schedule: {
			type: ParameterType.Schedule,
			displayName: "Audit dependency schedule",
			description: "Run a dependency audit on a schedule",
			required: false,
			defaultValue: "0 * * * *",
			visibility: ParameterVisibility.Hidden,
		},
	},

	commands: [
		{
			name: "runAudit",
			displayName: "run npm Audit",
			pattern: /^npm audit.*$/,
			description:
				"Run npm audit on single repository or all repositories",
		},
		{
			name: "runInstall",
			displayName: "run npm Install",
			pattern: /^npm install.*$/,
			description:
				"Run npm install on single repository or all repositories",
		},
	],
});
