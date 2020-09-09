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

import { CommandHandler, prompt } from "@atomist/skill";
import { audit } from "../audit";
import { AuditConfiguration } from "../configuration";

export const handler: CommandHandler<AuditConfiguration> = async ctx => {
	const cfg = await prompt.configurationWithParameters<
		{ owner?: string; repo?: string },
		AuditConfiguration
	>(ctx, {
		owner: { required: false },
		repo: { required: false },
	});
	return audit(
		ctx,
		cfg.configuration,
		Number.MAX_SAFE_INTEGER,
		(owner, repo) => {
			if (!!cfg.owner && cfg.owner !== owner) {
				return false;
			}
			if (!!cfg.repo && cfg.repo !== repo) {
				return false;
			}
			return true;
		},
	);
};
