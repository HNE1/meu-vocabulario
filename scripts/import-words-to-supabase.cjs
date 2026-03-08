/**
 * 将 data/words.json 导入到 Supabase words 表
 * 用法: 先配置 .env.local，然后执行 npm run import-words
 */

const { createClient } = require("@supabase/supabase-js");
const fs = require("fs");
const path = require("path");

// 加载 .env.local
const envPath = path.join(__dirname, "..", ".env.local");
if (fs.existsSync(envPath)) {
  const content = fs.readFileSync(envPath, "utf-8");
  for (const line of content.split("\n")) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m) process.env[m[1].trim()] = m[2].trim();
  }
}

function getTodayStr() {
  return new Date().toISOString().slice(0, 10);
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    console.error("错误: 请配置 .env.local 中的 NEXT_PUBLIC_SUPABASE_URL 和 NEXT_PUBLIC_SUPABASE_ANON_KEY");
    process.exit(1);
  }

  const filePath = path.join(__dirname, "..", "data", "words.json");
  if (!fs.existsSync(filePath)) {
    console.error("错误: 找不到 data/words.json");
    process.exit(1);
  }

  const items = JSON.parse(fs.readFileSync(filePath, "utf-8"));
  const today = getTodayStr();

  const rows = items.map((item) => ({
    id: item.id,
    word: item.word,
    translation: item.translation,
    is_verb: item.isVerb,
    conjugations: item.conjugations,
    example: item.example ?? null,
    interval: item.interval,
    ease_factor: item.easeFactor,
    next_review_date: today,
  }));

  const supabase = createClient(url, key);
  const { data, error } = await supabase.from("words").upsert(rows, { onConflict: "id" });

  if (error) {
    console.error("导入失败:", error.message);
    console.error("提示: 请先在 Supabase 执行 scripts/supabase-words-table.sql 创建表");
    process.exit(1);
  }

  console.log(`成功导入 ${rows.length} 个单词到 Supabase`);
}

main();
