/* eslint-disable @typescript-eslint/no-require-imports */
import assert = require("assert");
import { pascalCase } from "change-case";
import { cdk } from "projen";
import { CdktfConfig } from "./cdktf-config";
import { GithubIssues } from "./github-issues";
import { NextVersionPr } from "./next-version-pr";
import { PackageInfo } from "./package-info";
import { ProviderUpgrade } from "./provider-upgrade";
import { CheckForUpgradesScriptFile } from "./scripts/check-for-upgrades";
import { ShouldReleaseScriptFile } from "./scripts/should-release";

const version = require("../version.json").version;

export interface CdktfProviderProjectOptions extends cdk.JsiiProjectOptions {
  readonly useCustomGithubRunner?: boolean;
  readonly terraformProvider: string;
  readonly cdktfVersion: string;
  readonly constructsVersion: string;
  readonly jsiiVersion?: string;
  readonly forceMajorVersion?: number;
  /**
   * defaults to "cdktf"
   */
  readonly namespace?: string;
  /**
   * defaults to "cdktf"
   * previously was "hashicorp". Used for GitHub org name and package scoping
   */
  readonly githubNamespace?: string;
  readonly mavenEndpoint?: string;
  /**
   * defaults to "HashiCorp"
   */
  readonly nugetOrg?: string;
  /**
   * defaults to "hashicorp"
   */
  readonly mavenOrg?: string;
}

const authorAddress = "https://hashicorp.com";
const getMavenName = (providerName: string): string => {
  return ["null", "random"].includes(providerName)
    ? `${providerName}_provider`
    : providerName.replace(/-/gi, "_");
};
export class CdktfProviderProject extends cdk.JsiiProject {
  constructor(options: CdktfProviderProjectOptions) {
    const {
      terraformProvider,
      workflowContainerImage = "hashicorp/jsii-terraform",
      cdktfVersion,
      constructsVersion,
      minNodeVersion,
      jsiiVersion,
      authorName = "HashiCorp",
      namespace = "cdktf",
      githubNamespace = "cdktf",
      mavenEndpoint = "https://hashicorp.oss.sonatype.org",
      nugetOrg = "HashiCorp",
      mavenOrg = "hashicorp",
    } = options;
    const [fqproviderName, providerVersion] = terraformProvider.split("@");
    const providerName = fqproviderName.split("/").pop();
    assert(providerName, `${terraformProvider} doesn't seem to be valid`);
    assert(
      !providerName.endsWith("-go"),
      "providerName may not end with '-go' as this can conflict with repos for go packages"
    );

    const nugetName = `${nugetOrg}.${pascalCase(
      namespace
    )}.Providers.${pascalCase(providerName)}`;
    const mavenName = `com.${mavenOrg}.${namespace}.providers.${getMavenName(
      providerName
    )}`;

    const packageInfo: PackageInfo = {
      npm: {
        name: `@${githubNamespace}/provider-${providerName}`,
      },
      python: {
        distName: `${githubNamespace}-${namespace}-provider-${providerName.replace(
          /-/gi,
          "_"
        )}`,
        module: `${githubNamespace}_${namespace}_provider_${providerName.replace(
          /-/gi,
          "_"
        )}`,
      },
      publishToNuget: {
        dotNetNamespace: nugetName,
        packageId: nugetName,
      },
      publishToMaven: {
        javaPackage: mavenName,
        mavenGroupId: `com.${mavenOrg}`,
        mavenArtifactId: `${namespace}-provider-${providerName}`,
        mavenEndpoint,
      },
      publishToGo: {
        moduleName: `github.com/${githubNamespace}/${namespace}-provider-${providerName.replace(
          /-/g,
          ""
        )}-go`,
        gitUserEmail: "github-team-tf-cdk@hashicorp.com",
        gitUserName: "CDK for Terraform Team",
        packageName: providerName.replace(/-/g, ""),
      },
    };

    const repository = `${githubNamespace}/${namespace}-provider-${providerName.replace(
      /-/g,
      ""
    )}`;

    const workflowRunsOn = options.useCustomGithubRunner
      ? ["custom", "linux", "custom-linux-medium"] // 8 core, 32 GB
      : ["ubuntu-latest"]; // 7 GB

    super({
      ...options,
      workflowContainerImage,
      license: "MPL-2.0",
      releaseToNpm: true,
      minNodeVersion,
      devDeps: [
        `@cdktf/provider-project@^${version}`,
        "@actions/core@^1.1.0",
        "dot-prop@^5.2.0",
      ],
      name: packageInfo.npm.name,
      description: `Prebuilt ${providerName} Provider for Terraform CDK (cdktf)`,
      keywords: ["cdktf", "terraform", "cdk", "provider", providerName],
      sampleCode: false,
      jest: false,
      authorAddress,
      authorName,
      authorOrganization: true,
      defaultReleaseBranch: "main",
      repository: `https://github.com/${repository}.git`,
      mergify: false,
      eslint: false,
      depsUpgradeOptions: {
        workflowOptions: {
          labels: ["automerge"],
        },
      },
      python: packageInfo.python,
      publishToNuget: packageInfo.publishToNuget,
      publishToMaven: packageInfo.publishToMaven,
      publishToGo: packageInfo.publishToGo,
      releaseFailureIssue: true,
      peerDependencyOptions: {
        pinnedDevDependency: false,
      },
      workflowGitIdentity: {
        name: "team-tf-cdk",
        email: "github-team-tf-cdk@hashicorp.com",
      },
      workflowRunsOn,
      minMajorVersion: 1, // ensure new projects start with 1.0.0 so that every following breaking change leads to an increased major version
      githubOptions: {
        mergify: true,
        mergifyOptions: {
          rules: [
            {
              name: "Automatically approve PRs with automerge label",
              actions: {
                review: {
                  type: "APPROVE",
                  message: "Automatically approved due to label",
                },
              },
              conditions: [
                "label=automerge",
                "-label~=(do-not-merge)",
                "-draft",
                "author=team-tf-cdk",
              ],
            },
          ],
        },
      },
    });

    // Golang needs more memory to build
    this.tasks.addEnvironment("NODE_OPTIONS", "--max-old-space-size=7168");

    this.tasks.addEnvironment("CHECKPOINT_DISABLE", "1");

    new CdktfConfig(this, {
      terraformProvider,
      providerName,
      providerVersion,
      cdktfVersion,
      constructsVersion,
      jsiiVersion,
      packageInfo,
      githubNamespace,
    });
    const upgradeScript = new CheckForUpgradesScriptFile(this, {
      providerVersion,
      fqproviderName,
    });
    new ProviderUpgrade(this, {
      checkForUpgradesScriptPath: upgradeScript.path,
      workflowRunsOn,
    });
    new GithubIssues(this, { providerName });
    new NextVersionPr(this, "${{ secrets.GITHUB_TOKEN }}");

    new ShouldReleaseScriptFile(this, {});

    // hacky di hack hack hack - projen releases don't support cancelling a release yet
    (this.tasks.tryFind("release")!.condition as unknown as any) =
      "node ./scripts/should-release.js";
    const releaseJobSteps: any[] = (
      this.github?.tryFindWorkflow("release") as any
    ).jobs.release.steps;
    const gitRemoteJob = releaseJobSteps.find((it) => it.id === "git_remote");
    assert(
      gitRemoteJob.run ===
        'echo "latest_commit=$(git ls-remote origin -h ${{ github.ref }} | cut -f1)" >> $GITHUB_OUTPUT',
      "git_remote step in release workflow did not match expected string, please check if the workaround still works!"
    );
    const previousCommand = gitRemoteJob.run;
    const cancelCommand =
      'echo "latest_commit=release_cancelled" >> $GITHUB_OUTPUT'; // this cancels the release via a non-matching SHA;
    gitRemoteJob.run = `node ./scripts/should-release.js && ${previousCommand} || ${cancelCommand}`;
    gitRemoteJob.name += " or cancel via faking a SHA if release was cancelled";
  }
}
