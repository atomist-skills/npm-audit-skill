# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](http://keepachangelog.com/)
and this project adheres to [Semantic Versioning](http://semver.org/).

## [Unreleased](https://github.com/atomist-skills/npm-vulnerability-scanner-skill/compare/1.0.3...HEAD)

## [1.0.3](https://github.com/atomist-skills/npm-vulnerability-scanner-skill/compare/1.0.2...1.0.3) - 2021-04-22

### Changed

-   Add changelog link. [daa1713](https://github.com/atomist-skills/npm-vulnerability-scanner-skill/commit/daa17136fd6ab21eb8b049e1827efbed2ef5a4f6)
-   Update skill parameter metadata. [19c093c](https://github.com/atomist-skills/npm-vulnerability-scanner-skill/commit/19c093c521488495e0ab9feb435c8f91c494ec16)
-   Update to new logging. [c2d6006](https://github.com/atomist-skills/npm-vulnerability-scanner-skill/commit/c2d60062b6baacb21a64ce9796e66b3a3bdb2e20)

## [1.0.2](https://github.com/atomist-skills/npm-vulnerability-scanner-skill/compare/1.0.1...1.0.2) - 2021-04-01

### Changed

-   **BREAKING** Configuration parameter changes. [#147](https://github.com/atomist-skills/npm-vulnerability-scanner-skill/issues/147)
-   Update category. [91b868d](https://github.com/atomist-skills/npm-vulnerability-scanner-skill/commit/91b868d368ab9f865a21356afd181708dddaeb4d)

### Fixed

-   Reuse existing check run. [237915d](https://github.com/atomist-skills/npm-vulnerability-scanner-skill/commit/237915db0b3688e5a246c7ad4efe89d5407f3f05)

## [1.0.1](https://github.com/atomist-skills/npm-vulnerability-scanner-skill/compare/1.0.0...1.0.1) - 2020-12-06

### Fixed

-   Don't update when no packages are outdated. [8938bb0](https://github.com/atomist-skills/npm-vulnerability-scanner-skill/commit/8938bb08b60b2ff82f518e243b63846f48e24f2d)

## [1.0.0](https://github.com/atomist-skills/npm-vulnerability-scanner-skill/compare/0.2.2...1.0.0) - 2020-11-18

### Added

-   Add command to run npm install. [6b4385a](https://github.com/atomist-skills/npm-vulnerability-scanner-skill/commit/6b4385a2e2ace41300b10f5946e7567226816f90)

### Changed

-   Update skill icon. [bf14c50](https://github.com/atomist-skills/npm-vulnerability-scanner-skill/commit/bf14c50ca6123d9be9875443821710286616f280)
-   Use type generation in @atomist/skill. [d47cba1](https://github.com/atomist-skills/npm-vulnerability-scanner-skill/commit/d47cba189042bf00bac3c162ec7040d374530a42)

## [0.2.2](https://github.com/atomist-skills/npm-vulnerability-scanner-skill/compare/0.2.1...0.2.2) - 2020-10-20

### Changed

-   Update INFO.md. [#86](https://github.com/atomist-skills/npm-vulnerability-scanner-skill/issues/86)

## [0.2.1](https://github.com/atomist-skills/npm-vulnerability-scanner-skill/compare/0.2.0...0.2.1) - 2020-10-15

### Changed

-   Fix categories. [165a06b](https://github.com/atomist-skills/npm-vulnerability-scanner-skill/commit/165a06bd7d511f5cb17a570fb1be68ef4dcfd979)

### Fixed

-   Fix casing of npm in info text. [9b15209](https://github.com/atomist-skills/npm-vulnerability-scanner-skill/commit/9b15209f2a1cc78a68c9660515745808dbf704a6)

## [0.2.0](https://github.com/atomist-skills/npm-vulnerability-scanner-skill/compare/0.1.3...0.2.0) - 2020-10-15

### Changed

-   Improve schedule status message. [cd6b1fc](https://github.com/atomist-skills/npm-vulnerability-scanner-skill/commit/cd6b1fc3636b32ced4ddb7c9ab34e8267f745213)
-   Change name to Vulnerability Scanner for npm. [3668594](https://github.com/atomist-skills/npm-vulnerability-scanner-skill/commit/36685943f19f2bd19186645c5d40a9ed532e9181)
-   Update to npm-vulnerability-scanner-skill. [f7ba66b](https://github.com/atomist-skills/npm-vulnerability-scanner-skill/commit/f7ba66b14b902f6b87ca9ffb370219fade27020c)
-   Update skill documentation. [11d8987](https://github.com/atomist-skills/npm-vulnerability-scanner-skill/commit/11d89875736060039e46f1ee81bad7989e174539)

### Fixed

-   Always set commit check status. [#64](https://github.com/atomist-skills/npm-vulnerability-scanner-skill/issues/64)
-   Check return value of project.spawn. [#65](https://github.com/atomist-skills/npm-vulnerability-scanner-skill/issues/65)

## [0.1.3](https://github.com/atomist-skills/npm-vulnerability-scanner-skill/compare/0.1.2...0.1.3) - 2020-09-14

### Added

-   Add npm update feature. [fe8c6e4](https://github.com/atomist-skills/npm-vulnerability-scanner-skill/commit/fe8c6e4ff7927e517f4018f295ab14539ad5dbf7)
-   Document npm update feature. [7915ae6](https://github.com/atomist-skills/npm-vulnerability-scanner-skill/commit/7915ae6d2081704f9351a0c8a6442ecee8718c10)
-   Add command to run audit. [155231a](https://github.com/atomist-skills/npm-vulnerability-scanner-skill/commit/155231a19a650f73e3b55cd2a0136ea9910720d3)

### Fixed

-   Proper handling of audit level. [7a08b3d](https://github.com/atomist-skills/npm-vulnerability-scanner-skill/commit/7a08b3d1433568f5766790986e211bcd1d917ccc)

## [0.1.2](https://github.com/atomist-skills/npm-vulnerability-scanner-skill/compare/0.1.1...0.1.2) - 2020-07-28

### Changed

-   Update category. [c8a38e2](https://github.com/atomist-skills/npm-vulnerability-scanner-skill/commit/c8a38e23fb9afd4cea523400dd451b9748f1f1de)

## [0.1.1](https://github.com/atomist-skills/npm-vulnerability-scanner-skill/compare/0.1.0...0.1.1) - 2020-07-17

## [0.1.0](https://github.com/atomist-skills/npm-vulnerability-scanner-skill/tree/0.1.0) - 2020-07-17

### Added

-   Initial version. [bbe7fb9](https://github.com/atomist-skills/npm-vulnerability-scanner-skill/commit/bbe7fb974523a8555e5571ec4da4b706583cea2e)
