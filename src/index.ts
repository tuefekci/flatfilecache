
import * as fs from 'fs';
import * as path from 'path';
import { promisify } from 'util';
import crypto from 'crypto';

const mkdir = promisify(fs.mkdir);
const rmdir = promisify(fs.rmdir);
const unlink = promisify(fs.unlink);

function sha1(data: string) {
	const hash = crypto.createHash('sha1');
	hash.update(data);
	return hash.digest('hex');
}

class FileCache {

    options: any;
    cache: any;
    path: string;
    ttl: number;

    constructor(path: string, options: any) {
        this.options = options;
        this.cache = {};
        this.path = path;
        this.ttl = options.ttl || (60 * 60 * 24);
        this.createFolder();
    }

    async clear() {
        await this.clearFolder();
        await this.createFolder();
    }

    async createFolder() {
        try {
            await mkdir(this.path);
        } catch (err) {
            if (err.code !== 'EEXIST') {
                throw err;
            }
        }
        await this.validateCache();
    }

    async clearFolder() {
        await this.deleteFolderRecursive(this.path);
    }

    async deleteFolderRecursive(folder: string) {
        if (fs.existsSync(folder)) {
            fs.readdirSync(folder).forEach((file, index) => {
                const curPath = path.join(folder, file);
                if (fs.lstatSync(curPath).isDirectory()) { // recurse
                    this.deleteFolderRecursive(curPath);
                } else { // delete file
                    unlink(curPath);
                }
            });
            rmdir(folder);
        }
    }

    async validateCache() {
        let keys = await this.getAllKeys();

        for (let i = 0; i < keys.length; i++) {
            let key = keys[i];
            await this.validate(path.join(this.path, key));
        }
    }


    time() {
        return Math.floor(Date.now() / 1000);
    }

    getPath(key: string) {
        return path.join(this.path, sha1(key));
    }

    async validate(file: string) {
        try {
            let stats = await fs.promises.stat(file);

            if (stats.isFile()) {
                let modified = stats.mtime.getTime() / 1000;
                if (this.time() < modified) {
                    return true;
                } else {
                    await unlink(file);
                    return false;
                }
            } else {
                return false;
            }
        } catch (error) {
            if (error.code === 'ENOENT') {
                return false;
            } else {
                throw error;
            }
        }
    }

    async has(key: string) {
        try {
            let validate = await this.validate(this.getPath(key));
            return validate;
        } catch (error) {
			return false;
        }
    }

    async get(key: string) {
        if (await this.has(key)) {
            let data = await fs.promises.readFile(this.getPath(key), 'utf8');
            return JSON.parse(data);
        } else {
            return null;
        }
    }

    async set(key: string, value: any, options: any = {}) {
        let data = JSON.stringify(value);
        await fs.promises.writeFile(this.getPath(key), data, 'utf8');
        await fs.promises.utimes(this.getPath(key), new Date(), new Date(Date.now() + (options.ttl || this.ttl) * 1000));
    }

	async delete(key: string) {
		await unlink(this.getPath(key));
	}
	
	async deleteAll() {
		await this.clearFolder();
	}

	async getAllKeys() {
		try {
			// Use promise.all to read all files concurrently
			let files = await fs.promises.readdir(this.path);
			// Use map function to extract key from file name
			let data = files.map(file => file.split('.')[0]);
			return data;
		} catch (error) {
			if (error.code === 'ENOENT') {
				return [];
			} else {
				throw error;
			}
		}
	}

}

export default FileCache;