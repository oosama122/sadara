declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    SADARA_ADMIN_EMAIL?: string;
    BUCKET?: R2Bucket;
  }
}
