import nodemailer from "nodemailer";
import { IS_PROD, SMTP } from "$/env";

class MailService {
  #transport = SMTP.host
    ? nodemailer.createTransport({
        host: SMTP.host,
        port: SMTP.port,
        secure: SMTP.port === 465,
        auth: { user: SMTP.user, pass: SMTP.pass },
      })
    : null;

  get configured() {
    return !!this.#transport;
  }

  /** Returns false when the email could not be sent. In dev without SMTP it logs instead. */
  async send(to: string, subject: string, text: string, html?: string) {
    if (!this.#transport) {
      if (!IS_PROD) {
        console.info(`[mail:dev] to=${to} subject="${subject}"\n${text}`);
        return true;
      }
      console.error("SMTP is not configured; cannot send email");
      return false;
    }
    try {
      await this.#transport.sendMail({
        from: SMTP.from,
        to,
        subject,
        text,
        html,
      });
      return true;
    } catch (error) {
      console.error("email send failed", error);
      return false;
    }
  }
}

export const mailService = new MailService();
