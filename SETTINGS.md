## Before you get started

Connect and configure these integrations:

1.  **GitHub**
2.  **Slack or Microsoft Teams**

The **GitHub** integration must be configured in order to use this skill. At
least one repository must be selected. The **Slack** or **Microsoft Teams**
integration is optional.

## How to configure

1.  **Configure minimum severity to report**

    By default, this skill will set a failed GitHub Check on any detected
    vulnerability. Use this parameter to specify the minimum severity to fail
    on.

2.  **Exclude development dependencies**

    Run `npm audit` with the `--production` only flag to exclude development
    dependencies from auditing.

3.  **Exclude specific packages**

    Use this parameter to exclude specific npm packages from auditing and
    automatic updates when fixing.

4.  **Exclude specific npm advisories**

    Use this parameter to exclude specific npm advisories by their ids from
    auditing and automatic updates when fixing.

5.  **Specify how to apply fixes**

    Choose which fix apply option to use or choose not to apply fixes. When a
    fix option is selected, `npm audit fix` will be run. The following options
    are available:

    -   **Raise pull request for default branch; commit to other branches** -
        with this option, fixes on the default branch will be submitted via a
        pull request; fixes on other branches will be committed straight onto
        the branch
    -   **Raise pull request for default branch only** - with this option, fixes
        on the default branch will be submitted via a pull request; fixes on
        other branches will not be persisted
    -   **Raise pull request for any branch** - with this option, fixes on all
        branches will be submitted via a pull request
    -   **Commit to default branch only** - with this option, fixes on the
        default branch will be committed straight to the branch; fixes on other
        branches will not be persisted
    -   **Commit to any branch** - with this option, fixes on all branches will
        be committed straight to the branch
    -   **Do not fix detected vulnerabilities**

    Pull requests that get raised by this skill will automatically have a
    reviewer assigned based on the person who pushed code. Pull requests that
    are not needed any longer, i.e., because all security vulnerabilities were
    fixed manually, are closed automatically.

6.  **Install potentially breaking updates**

    Run `npm audit fix` with the `--force` flag to install potentially breaking,
    semver-major updates.

7.  **Configure pull request labels**

    Add additional labels to pull requests raised by this skill.

    This is useful to influence how and when the PR should be auto-merged by the
    [Auto-Merge Pull Requests](https://go.atomist.com/catalog/skills/atomist/github-auto-merge-skill)
    skill.

8.  **Specify how to update dependencies**

    When there are no security vulnerabilities to fix, this skill can run
    `npm outdated` and `npm update` to determine and update dependencies
    automatically.  
    The following options are available:

    -   **Raise pull request for default branch; commit to other branches** -
        with this option, updates on the default branch will be submitted via a
        pull request; updates on other branches will be committed straight onto
        the branch
    -   **Raise pull request for default branch only** - with this option,
        updates on the default branch will be submitted via a pull request;
        updates on other branches will not be attempted
    -   **Raise pull request for any branch** - with this option, updates on all
        branches will be submitted via a pull request
    -   **Commit to default branch only** - with this option, updates on the
        default branch will be committed straight to the branch; updates on
        other branches will not be attempted
    -   **Commit to any branch** - with this option, updates on all branches
        will be committed straight to the branch
    -   **DDo not update dependencies**

    Pull requests that get raised by this skill will automatically have a
    reviewer assigned based on the person who pushed code. Pull requests that
    are not needed any longer, i.e., because all security vulnerabilities were
    fixed manually, are closed automatically.

9.  **Determine repository scope**

    By default, this skill will be enabled for all repositories in all
    organizations you have connected.

    To restrict the organizations or specific repositories on which the skill
    will run, you can explicitly choose organization(s) and repositories.
