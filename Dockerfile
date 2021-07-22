# Set up build
FROM node:lts@sha256:ddb46bba1d217197a8bdc9c98a22026f2bbf8e609a7e758af0c30a83619c11fe AS build

WORKDIR /usr/src

COPY . ./

RUN npm ci --no-optional && \
    npm run compile && \
    rm -rf node_modules .git

FROM atomist/skill:node14@sha256:28c020197bcbf2e4155136705ded591d8c34f90db41cc045ffa28bef077cf745

WORKDIR "/skill"

COPY package.json package-lock.json ./

RUN npm ci --no-optional \
    && rm -rf /root/.npm

COPY --from=build /usr/src/ .

WORKDIR "/atm/home"

ENTRYPOINT ["node", "--no-deprecation", "--no-warnings", "--expose_gc", "--optimize_for_size", "--always_compact", "--max_old_space_size=512", "/skill/node_modules/.bin/atm-skill"]
CMD ["run"]
