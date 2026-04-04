import { posix } from "path";
import IBMi from "../IBMi";
import { Tools } from "../Tools";
import { ComponentIdentification, IBMiComponent, SecureComponentState } from "./component";

export class PasswordManager implements IBMiComponent {
  static readonly ID = "CHGPWD";
  static readonly SIGNATURE = "";
  static readonly VERSION = 2;
  static readonly PROCEDURE = `CHGPWD_${this.VERSION}`;

  getIdentification(): ComponentIdentification {
    return { name: PasswordManager.ID, version: PasswordManager.VERSION, signature: PasswordManager.SIGNATURE };
  }

  async setInstallDirectory?(_installDirectory: string) {
    //Not used
  }

  async getRemoteState(connection: IBMi): Promise<SecureComponentState> {
    const remoteSignature = await connection.getContent().getSQLRoutineSignature(connection.getConfig().tempLibrary.toUpperCase(), PasswordManager.PROCEDURE, "PROCEDURE");
    return { status: remoteSignature ? "Installed" : "NotInstalled", remoteSignature };
  }

  async update(connection: IBMi): Promise<SecureComponentState> {
    try {
      await connection.withTempDirectory(async directory => {
        const source = posix.join(directory, `${PasswordManager.ID}.sql`);
        const procedure = `${connection.getConfig().tempLibrary}.${PasswordManager.PROCEDURE}`;
        await connection.getContent().writeStreamfileRaw(source, /* sql */`
          create or replace procedure ${procedure}(oldPassword varchar(128), newPassword varchar(128))
          language sql
          not deterministic
          begin
            call QSYS.QSYCHGPW(
              '*CURRENT  ', oldPassword, newPassword,
              X'00000000',
              LENGTH(oldPassword), 0, LENGTH(newPassword), 0        
            );
          end;

          comment on procedure ${procedure} is 'Change password';
          call QSYS2.QCMDEXC('grtobjaut ${connection.getConfig().tempLibrary}/${PasswordManager.ID} *PGM *PUBLIC *ALL');
        `);
        const compile = await connection.runCommand({
          command: `RUNSQLSTM SRCSTMF('${source}') COMMIT(*NONE) NAMING(*SQL) OPTION(*NOSRC)`,
          noLibList: true
        });
        if (compile.code !== 0) {
          throw Error(compile.stderr || compile.stdout);
        }
      });

      return this.getRemoteState(connection);
    }
    catch (error: any) {
      connection.appendOutput(`Failed to install ${PasswordManager.ID} procedure:\n${typeof error === "string" ? error : JSON.stringify(error)}`);
      return { status: "Error" };
    }
  }

  async getPasswordExpiration(connection: IBMi) {
    const [row] = (await connection.runSQL(/* sql */`
      Select EXTRACT(EPOCH FROM (DATE_PASSWORD_EXPIRES)) * 1000 AS EXPIRATION,
      DAYS(DATE_PASSWORD_EXPIRES) - DAYS(current_timestamp) as DAYS_LEFT
      FROM TABLE (QSYS2.QSYUSRINFO('${connection.upperCaseName(connection.currentUser)}'))
    `));
    if (row && row.EXPIRATION) {
      return {
        expiration: new Date(Number(row.EXPIRATION)),
        daysLeft: Number(row.DAYS_LEFT)
      }
    }
  }

  async changePassword(connection: IBMi, oldPassword: string, newPassword: string) {
    try {
      await connection.runSQL(`call ${connection.getConfig().tempLibrary}.${PasswordManager.ID}(?, ?)`, { bindings: [oldPassword, newPassword] });
    }
    catch (error: any) {
      if (error instanceof Tools.SqlError) {
        const message = /(\[.*\] )?(.*), \d+/.exec(error.message)?.[2]; //try to keep only the relevant part of the error
        throw new Error(message || error.message);
      }
      else if (error instanceof Error) {
        throw error
      }

      throw Error(String(error));
    }

  }
}