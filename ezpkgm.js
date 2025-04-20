const fs = require('fs');
const https = require('https');
const unzipper = require('unzipper');
const path = require('path');
const { exec } = require('child_process');

class PackageManager {
    constructor(configFile) {
        this.configFile = configFile;
        this.projects = this.loadConfig();
        this.ezpkgmRepoUrl = 'https://raw.githubusercontent.com/ezpkgm/ezpkgm/main'; // Correct URL
        this.userAgent = 'ezpkgm-package-manager/1.0'; // Add a user agent
    }

    loadConfig() {
        try {
            const data = fs.readFileSync(this.configFile);
            return JSON.parse(data);
        } catch (error) {
            console.error(`[ERROR] Failed to load config file: ${error.message}`);
            console.warn("[WARNING] Using default empty configuration.");
            return { projects: {} }; // Return an empty projects object to avoid errors
        }
    }

    async checkForUpdates() {
        try {
            console.log("[INFO] Checking for config updates...");
            await this.checkForConfigUpdates();
        } catch (error) {
            console.error(`[ERROR] Error checking for updates: ${error.message}`);
        }
    }

    async checkForConfigUpdates() {
        const remoteConfigUrl = `${this.ezpkgmRepoUrl}/config.json`;
        try {
            const remoteConfig = await this.fetchRemoteConfig(remoteConfigUrl);
            const currentConfig = this.loadConfig();

            if (JSON.stringify(remoteConfig) !== JSON.stringify(currentConfig)) {
                console.log('[UPDATE] Config file update available.');
                this.promptForUpdate('config', () => {
                    this.updateConfigFile(remoteConfig);
                });
            } else {
                console.log('[INFO] Config file is up to date.');
            }
        } catch (error) {
            console.error(`[ERROR] Error checking for config updates: ${error.message}`);
        }
    }

    fetchRemoteConfig(url) {
        const options = {
            headers: {
                'User-Agent': this.userAgent // Include User-Agent header
            }
        };

        return new Promise((resolve, reject) => {
            https.get(url, options, (res) => {
                let data = '';
                res.on('data', (chunk) => data += chunk);
                res.on('end', () => {
                    if (res.statusCode !== 200) {
                        reject(new Error(`[ERROR] Failed to fetch ${url}. Status code: ${res.statusCode}`));
                        return;
                    }
                    try {
                        const parsedData = JSON.parse(data);
                        resolve(parsedData);
                    } catch (error) {
                        console.error(`[ERROR] Error parsing JSON from ${url}: ${error.message}`);
                        console.error(`[DEBUG] Received data: ${data}`); // Log the raw data
                        reject(error);
                    }
                });
            }).on('error', (err) => {
                console.error(`[ERROR] Error fetching data from ${url}: ${err.message}`);
                reject(err);
            });
        });
    }

    promptForUpdate(type, updateFunction) {
        const readline = require('readline').createInterface({
            input: process.stdin,
            output: process.stdout,
        });

        readline.question(`[QUESTION] Do you want to update the ${type}? (y/n): `, (answer) => {
            readline.close();
            if (answer.toLowerCase() === 'y') {
                updateFunction();
            } else {
                console.log(`[INFO] Update of ${type} skipped.`);
            }
        });
    }

    updateConfigFile(remoteConfig) {
        try {
            fs.writeFileSync(this.configFile, JSON.stringify(remoteConfig, null, 2));
            this.projects = remoteConfig; // Reload the config
            console.log('[SUCCESS] Config file updated successfully.');
        } catch (error) {
            console.error(`[ERROR] Error updating config file: ${error.message}`);
        }
    }

    installPackage(projectName) {
        if (!this.projects.projects || !this.projects.projects[projectName]) {
            console.warn(`[WARNING] Project '${projectName}' not found in config.`);
            return;
        }

        const projectInfo = this.projects.projects[projectName];
        console.debug("Project Info:", projectInfo);

        const repo = projectInfo.Repo;
        const version = projectInfo.Version;
        const origin = projectInfo.Origin;

        console.log(`[INFO] Downloading ${projectName} from https://github.com/${projectName}/${repo}/archive/refs/tags/${version}.zip...`);
        this.downloadWithRedirect(`https://github.com/${projectName}/${repo}/archive/refs/tags/${version}.zip`, projectName, version, origin);
    }

    downloadWithRedirect(url, projectName, version, destination) {
        https.get(url, (response) => {
            if (response.statusCode === 302 || response.statusCode === 301) {
                const redirectUrl = response.headers.location;
                console.log(`[INFO] Redirected to: ${redirectUrl}`);
                this.downloadWithRedirect(redirectUrl, projectName, version, destination);
            } else if (response.statusCode === 200) {
                const zipFilePath = path.join(__dirname, `${projectName}-${version}.zip`);
                const file = fs.createWriteStream(zipFilePath);
                response.pipe(file);

                file.on('finish', () => {
                    file.close(() => {
                        console.log(`[SUCCESS] Downloaded ${zipFilePath}`);
                        this.unzipPackage(zipFilePath, destination);
                    });
                });
            } else {
                console.error(`[ERROR] Failed to download project: ${response.statusCode}`);
            }
        }).on('error', (err) => {
            console.error(`[ERROR] Error: ${err.message}`);
        });
    }

    unzipPackage(zipFilePath, destination) {
        if (!fs.existsSync(destination)) {
            fs.mkdirSync(destination, { recursive: true });
        }

        fs.createReadStream(zipFilePath)
            .pipe(unzipper.Extract({ path: destination }))
            .on('close', () => {
                console.log(`[SUCCESS] Unzipped ${zipFilePath} to ${destination}`);
                fs.unlinkSync(zipFilePath);
                console.log(`[INFO] Removed zip file: ${zipFilePath}`);
            })
            .on('error', (err) => {
                console.error(`[ERROR] Error unzipping: ${err.message}`);
            });
    }
}

// Main execution
(async () => {
    const packageManager = new PackageManager('config.json');

    // Check for updates before proceeding
    await packageManager.checkForUpdates();

    const projectName = process.argv[2];

    if (projectName) {
        packageManager.installPackage(projectName);
    } else {
        console.log("[INFO] Please provide a project name to install.");
    }
})();
