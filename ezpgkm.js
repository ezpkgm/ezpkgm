const fs = require('fs');
const https = require('https');
const unzipper = require('unzipper');
const path = require('path');

class PackageManager {
    constructor(configFile) {
        this.configFile = configFile;
        this.projects = this.loadConfig();
    }

    loadConfig() {
        const data = fs.readFileSync(this.configFile);
        return JSON.parse(data);
    }

    installPackage(projectName) {
        // Check if the project exists in the configuration
        if (!this.projects.projects || !this.projects.projects[projectName]) {
            console.log(`Project '${projectName}' not found in config.`);
            return;
        }

        const projectInfo = this.projects.projects[projectName]; // Access the project info
        console.log("projectInfo:", projectInfo); // Debugging log
        const repo = projectInfo.Repo; // Get the Repo field
        console.log("repo:", repo); // Debugging log
        const version = projectInfo.Version; // Get the Version field
        console.log("version:", version); // Debugging log
        const origin = projectInfo.Origin; // Get the Origin field
        console.log("origin:", origin); // Debugging log

        // Construct the URL for the package in the ezpkgm repository
        const repoUrl = `https://github.com/ezpkgm/${repo}/archive/refs/tags/${version}.zip`;
        console.log(`Downloading ${projectName} from ${repoUrl}...`);

        this.downloadWithRedirect(repoUrl, projectName, version, origin);
    }

    downloadWithRedirect(url, projectName, version, destination) {
        https.get(url, (response) => {
            if (response.statusCode === 302 || response.statusCode === 301) {
                // Follow the redirect
                const redirectUrl = response.headers.location;
                console.log(`Redirected to: ${redirectUrl}`);
                this.downloadWithRedirect(redirectUrl, projectName, version, destination); // Recursive call
            } else if (response.statusCode === 200) {
                const zipFilePath = path.join(__dirname, `${projectName}-${version}.zip`);
                const file = fs.createWriteStream(zipFilePath);
                response.pipe(file);

                file.on('finish', () => {
                    file.close(() => {
                        console.log(`Downloaded ${zipFilePath}`);
                        this.unzipPackage(zipFilePath, destination);
                    });
                });
            } else {
                console.log(`Failed to download project: ${response.statusCode}`);
            }
        }).on('error', (err) => {
            console.error(`Error: ${err.message}`);
        });
    }

    unzipPackage(zipFilePath, destination) {
        if (!fs.existsSync(destination)) {
            fs.mkdirSync(destination, { recursive: true });
        }

        fs.createReadStream(zipFilePath)
            .pipe(unzipper.Extract({ path: destination }))
            .on('close', () => {
                console.log(`Unzipped ${zipFilePath} to ${destination}`);
                fs.unlinkSync(zipFilePath);
                console.log(`Removed zip file: ${zipFilePath}`);
            });
    }
}

const packageManager = new PackageManager('config.json');
const projectName = process.argv[2];

if (projectName) {
    packageManager.installPackage(projectName);
} else {
    console.log("Please provide a project name to install.");
}
