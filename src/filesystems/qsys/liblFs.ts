import vscode, { ExtensionContext, FileSystemError } from "vscode";
import { instance } from "../../instantiate";
import { QSysFS } from "./QSysFs";

export class LiblFS extends QSysFS {
    constructor(context: ExtensionContext) {
        super(context);
    }

    async stat(uri: vscode.Uri): Promise<vscode.FileStat> {
        if (uri.path === '/') {
            return {
                ctime: 0,
                mtime: 0,
                size: 0,
                type: vscode.FileType.Directory,
                permissions: undefined
            };
        }
        
        return super.stat(uri);
    }

    async readFile(uri: vscode.Uri, retrying?: boolean): Promise<Uint8Array> {
        return super.readFile(uri, retrying);
    }

    async writeFile(uri: vscode.Uri, content: Uint8Array, options: { readonly create: boolean; readonly overwrite: boolean; }) {
        return super.writeFile(uri, content, options);
    }

    rename(oldUri: vscode.Uri, newUri: vscode.Uri, options: { readonly overwrite: boolean; }): void | Thenable<void> {
        return super.rename(oldUri, newUri, options);
    }

    watch(uri: vscode.Uri, options: { readonly recursive: boolean; readonly excludes: readonly string[]; }): vscode.Disposable {
        return super.watch(uri, options);
    }

    async readDirectory(uri: vscode.Uri): Promise<[string, vscode.FileType][]> {
        if (uri.path === '/') {
            const connection = instance.getConnection();
            if (connection) {
                const config = connection.getConfig();
                const libraryList = config.libraryList;
                if (libraryList && libraryList.length > 0) {
                    return libraryList.map(lib => [lib, vscode.FileType.Directory]);
                } else {
                    return [];
                }
            }
            throw FileSystemError.FileNotFound(uri);
        }
        
        return super.readDirectory(uri);
    }

    async createDirectory(uri: vscode.Uri) {
        return super.createDirectory(uri);
    }

    delete(uri: vscode.Uri, options: { readonly recursive: boolean; }): void | Thenable<void> {
        return super.delete(uri, options);
    }
}