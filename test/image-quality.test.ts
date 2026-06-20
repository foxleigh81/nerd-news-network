import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import { ensureImageQualityColumns, updateArticleImageQuality } from '../scripts/image-quality.mjs';

describe('image quality persistence', () => {
  it('does not dirty the SQLite article row when the image quality result is unchanged', () => {
    const db = new Database(':memory:');
    db.exec(`
      CREATE TABLE articles (
        id INTEGER PRIMARY KEY,
        headline TEXT NOT NULL,
        updated_at TEXT NOT NULL DEFAULT '2026-06-20T00:00:00Z'
      );
      INSERT INTO articles (id, headline) VALUES (1, 'Stable image row');
    `);
    ensureImageQualityColumns(db);

    const result = { score: 52, status: 'weak', reason: 'low resolution' };
    const first = updateArticleImageQuality(db, 1, result);
    const second = updateArticleImageQuality(db, 1, result);

    expect(first.changes).toBe(1);
    expect(second.changes).toBe(0);
  });
});
