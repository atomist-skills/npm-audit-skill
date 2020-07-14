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

import { Category, parameter, ParameterType, ParameterVisibility, resourceProvider, skill } from "@atomist/skill";
import { AuditConfiguration } from "./lib/configuration";

export const Skill = skill<AuditConfiguration & { repos: any; schedule: any }>({
    name: "npm-audit-skill",
    namespace: "atomist",
    displayName: "npm Audit",
    author: "Atomist",
    categories: [Category.CodeReview],
    license: "Apache-2.0",
    homepageUrl: "https://github.com/atomist-skills/npm-audit-skill",
    repositoryUrl: "https://github.com/atomist-skills/npm-audit-skill.git",
    iconUrl: "file://docs/images/icon.svg",

    containers: {
        npm: {
            image: "gcr.io/atomist-container-skills/npm-audit-skill",
        },
    },

    resourceProviders: {
        github: resourceProvider.gitHub({ minRequired: 1 }),
        chat: resourceProvider.chat({ minRequired: 0 }),
    },

    parameters: {
        level: {
            type: ParameterType.SingleChoice,
            displayName: "Audit level",
            description:
                "By default, the skill will set a failed check if any vulnerability is found. It may be useful to specify the minimum vulnerability level that will cause the check to fail.",
            options: [
                {
                    text: "Low",
                    value: "low",
                },
                {
                    text: "Moderate",
                    value: "moderate",
                },
                {
                    text: "High",
                    value: "high",
                },
                {
                    text: "Critical",
                    value: "critical",
                },
            ],
            required: false,
        },
        ignoreDev: {
            type: ParameterType.Boolean,
            displayName: "Exclude devDependencies",
            description: "Exclude development dependencies when auditing",
            required: false,
        },
        exclusions: {
            type: ParameterType.StringArray,
            displayName: "Exclude dependencies",
            description:
                "Exclude certain npm packages from auditing and automatic updates when running `npm audit fix`",
            required: false,
        },
        push: parameter.pushStrategy({
            displayName: "Fix security vulnerabilities",
            description:
                "Run `npm audit fix` and determine how and when fixes should be committed back into the repository",
            options: [
                {
                    text: "Do not fix detected vulnerabilities",
                    value: "none",
                },
            ],
        }),
        force: {
            type: ParameterType.Boolean,
            displayName: "Force updates",
            description:
                "Have `npm audit fix' install semver-major updates to top-level dependencies, not just semver-compatible ones",
            required: false,
        },
        labels: {
            type: ParameterType.StringArray,
            displayName: "Pull request labels",
            description:
                "Add additional labels to pull requests raised by this skill, e.g. to configure the [auto-merge](https://go.atomist.com/catalog/skills/atomist/github-auto-merge-skill) behavior.",
            required: false,
        },
        repos: parameter.repoFilter(),
        schedule: {
            type: ParameterType.Schedule,
            displayName: "Audit dependency schedule",
            description: "Run a dependency audit on a schedule",
            required: false,
            defaultValue: "*/30 * * * *",
            visibility: ParameterVisibility.Hidden,
        },
    },

    subscriptions: ["file://graphql/subscription/*.graphql"],
});
