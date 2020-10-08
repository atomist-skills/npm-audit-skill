# `atomist/npm-audit-skill`

<!---atomist-skill-description:start--->

Find and fix security vulnerabilities in npm dependencies

<!---atomist-skill-description:end--->

---

<!---atomist-skill-readme:start--->

# What it's useful for

`npm audit` is a tool that performs a moment-in-time security review of your
project’s dependency tree and can help you fix a vulnerability.

-   Always make sure your dependencies are getting scanned for latest security
    vulnerabilities
-   Get help to fix those vulnerabilities by receiving pull requests with
    updates
-   Apply same security review policy across your entire organization
-   Exclude certain dependencies from auditing and upgrades

When there are no security vulnerabilities in a project, this skill can
optionally help to keep dependencies current and up-to-date.

# Before you get started

Connect and configure these integrations:

1. **GitHub**
1. **Slack or Microsoft Teams**

The **GitHub** integration must be configured in order to use this skill. At
least one repository must be selected. The **Slack** or **Microsoft Teams**
integration is optional.

# How to configure

1. **Configure minimum severity to report**

    By default, this skill will set a failed GitHub Check on any detected
    vulnerability. Use this parameter to specify the minimum severity to fail
    on.

1. **Exclude development dependencies**

    Run `npm audit` with the `--production` only flag to exclude development
    dependencies from auditing.

1. **Exclude specific packages**

    Use this parameter to exclude specific npm packages from auditing and
    automatic updates when fixing.

1. **Exclude specific npm advisories**

    Use this parameter to exclude specific npm advisories by their ids from
    auditing and automatic updates when fixing.

1. **Specify how to apply fixes**

    Choose which fix apply option to use or choose not to apply fixes. When a
    fix option is selected, `npm audit fix` will be run. The following options
    are available:

    - **Raise pull request for default branch; commit to other branches** - with
      this option, fixes on the default branch will be submitted via a pull
      request; fixes on other branches will be committed straight onto the
      branch
    - **Raise pull request for default branch only** - with this option, fixes
      on the default branch will be submitted via a pull request; fixes on other
      branches will not be persisted
    - **Raise pull request for any branch** - with this option, fixes on all
      branches will be submitted via a pull request
    - **Commit to default branch only** - with this option, fixes on the default
      branch will be committed straight to the branch; fixes on other branches
      will not be persisted
    - **Commit to any branch** - with this option, fixes on all branches will be
      committed straight to the branch
    - **Do not fix detected vulnerabilities**

    Pull requests that get raised by this skill will automatically have a
    reviewer assigned based on the person who pushed code. Pull requests that
    are not needed any longer, i.e., because all security vulnerabilities were
    fixed manually, are closed automatically.

1. **Install potentially breaking updates**

    Run `npm audit fix` with the `--force` flag to install potentially breaking,
    semver-major updates.

1. **Configure pull request labels**

    Add additional labels to pull requests raised by this skill.

    This is useful to influence how and when the PR should be auto-merged by the
    [Auto-Merge Pull Requests](https://go.atomist.com/catalog/skills/atomist/github-auto-merge-skill)
    skill.

1. **Specify how to update dependencies**

    When there are no security vulnerabilities to fix, this skill can run
    `npm outdated` and `npm update` to determine and update dependencies
    automatically.  
    The following options are available:

    - **Raise pull request for default branch; commit to other branches** - with
      this option, updates on the default branch will be submitted via a pull
      request; updates on other branches will be committed straight onto the
      branch
    - **Raise pull request for default branch only** - with this option, updates
      on the default branch will be submitted via a pull request; updates on
      other branches will not be attempted
    - **Raise pull request for any branch** - with this option, updates on all
      branches will be submitted via a pull request
    - **Commit to default branch only** - with this option, updates on the
      default branch will be committed straight to the branch; updates on other
      branches will not be attempted
    - **Commit to any branch** - with this option, updates on all branches will
      be committed straight to the branch
    - **DDo not update dependencies**

    Pull requests that get raised by this skill will automatically have a
    reviewer assigned based on the person who pushed code. Pull requests that
    are not needed any longer, i.e., because all security vulnerabilities were
    fixed manually, are closed automatically.

1. **Determine repository scope**

    By default, this skill will be enabled for all repositories in all
    organizations you have connected.

    To restrict the organizations or specific repositories on which the skill
    will run, you can explicitly choose organization(s) and repositories.

# How to keep your npm dependencies free of vulnerabilities

1. **Set up the skill**

1. **Commit and push your code changes**

1. **Enjoy using safe dependencies!**

To create feature requests or bug reports, create an
[issue in the repository for this skill](https://github.com/atomist-skills/npm-audit-skill/issues).
See the [code](https://github.com/atomist-skills/npm-audit-skill) for the skill.

<!---atomist-skill-readme:end--->

---

Created by [Atomist][atomist]. Need Help? [Join our Slack workspace][slack].

[atomist]: https://atomist.com/ "Atomist"
[slack]: https://join.atomist.com/ "Atomist Community Slack"
