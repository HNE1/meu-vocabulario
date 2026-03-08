import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { readFile } from "fs/promises";
import { join } from "path";

function getTodayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

type WordsJsonItem = {
  id: number;
  word: string;
  translation: string;
  isVerb: boolean;
  conjugations: Record<string, string> | null;
  example?: { pt: string; zh: string };
  interval: number;
  easeFactor: number;
};

export async function POST(request: NextRequest) {
  const url = new URL(request.url);
  const secret = url.searchParams.get("secret");
  const envSecret = process.env.IMPORT_WORDS_SECRET;
  if (envSecret && secret !== envSecret) {
    return NextResponse.json({ error: "未授权" }, { status: 401 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseKey) {
    return NextResponse.json(
      { error: "Supabase 未配置，请检查 .env.local" },
      { status: 500 }
    );
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    const filePath = join(process.cwd(), "data", "words.json");
    const raw = await readFile(filePath, "utf-8");
    const items = JSON.parse(raw) as WordsJsonItem[];
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

    const { data, error } = await supabase
      .from("words")
      .upsert(rows, { onConflict: "id" });

    if (error) {
      return NextResponse.json(
        { error: `导入失败: ${error.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      count: rows.length,
      message: `已导入 ${rows.length} 个单词`,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: `读取或解析 words.json 失败: ${message}` },
      { status: 500 }
    );
  }
}
