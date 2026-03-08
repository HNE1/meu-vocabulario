-- 在 Supabase SQL 编辑器中执行此脚本，创建 words 表
-- Dashboard → SQL Editor → New query

CREATE TABLE IF NOT EXISTS words (
  id INTEGER PRIMARY KEY,
  word TEXT NOT NULL,
  translation TEXT NOT NULL,
  is_verb BOOLEAN NOT NULL DEFAULT false,
  conjugations JSONB,
  example JSONB,
  interval INTEGER NOT NULL DEFAULT 0,
  ease_factor REAL NOT NULL DEFAULT 2.5,
  next_review_date DATE NOT NULL DEFAULT CURRENT_DATE
);

-- 开启 RLS 时，允许匿名用户读取和更新（用于客户端背单词）
ALTER TABLE words ENABLE ROW LEVEL SECURITY;

CREATE POLICY "允许匿名读取 words"
  ON words FOR SELECT
  USING (true);

CREATE POLICY "允许匿名更新 words"
  ON words FOR UPDATE
  USING (true)
  WITH CHECK (true);

-- 如需通过 API 导入，需允许插入和 upsert
CREATE POLICY "允许匿名插入 words"
  ON words FOR INSERT
  WITH CHECK (true);
