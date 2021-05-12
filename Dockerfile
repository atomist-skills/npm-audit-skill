# Set up build
FROM node:lts@sha256:43bb29ec0b053be1d9120b13ec26e1d978a1dcc9188446934ad7173232a5c479 AS build

WORKDIR /usr/src

COPY . ./

RUN npm ci --no-optional && \
    npm run compile && \
    rm -rf node_modules .git

FROM atomist/skill:node14@sha256:1f5574256296251d381a78d1987b83723534b419409d54a1a12b5595e23fb47f

WORKDIR "/skill"

COPY package.json package-lock.json ./

RUN npm ci --no-optional \
    && rm -rf /root/.npm

COPY --from=build /usr/src/ .

WORKDIR "/atm/home"

ENTRYPOINT ["node", "--no-deprecation", "--no-warnings", "--expose_gc", "--optimize_for_size", "--always_compact", "--max_old_space_size=512", "/skill/node_modules/.bin/atm-skill"]
CMD ["run"]
