"use client";

import { useState, useCallback, useEffect } from "react";
import { supabase } from "@/lib/supabase";

type TabType = "study" | "library" | "settings";

type WordItem = {
  id: number;
  word: string;
  translation: string;
  isVerb: boolean;
  isIrregular?: boolean;
  conjugations: Record<string, string> | null;
  example?: { pt: string; zh: string };
  interval: number;
  easeFactor: number;
  nextReviewDate: string;
};

/** Supabase words 表返回的原始行（snake_case） */
type SupabaseWordRow = {
  id: number;
  word: string;
  translation: string;
  is_verb: boolean;
  conjugations: Record<string, string> | null;
  interval: number;
  ease_factor: number;
  next_review_date: string;
  example?: { pt: string; zh: string } | null;
};

const CONJUGATION_KEYS = ["eu", "ele/ela/você", "nós", "eles/elas/vocês"] as const;

const TAB_TITLES: Record<TabType, string> = {
  study: "背词",
  library: "词库",
  settings: "设置",
};

const STORAGE_KEYS = {
  settings: "flashcard-settings",
  dailyStats: "flashcard-daily-stats",
} as const;

type StoredSettings = { dailyNew: number; dailyReview: number; isDarkMode: boolean };
type DailyStats = { learnedCount: number; reviewedCount: number };

function loadSettings(): StoredSettings {
  if (typeof window === "undefined") return { dailyNew: 15, dailyReview: 30, isDarkMode: false };
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.settings);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<StoredSettings>;
      return {
        dailyNew: Math.max(5, Math.min(100, parsed.dailyNew ?? 15)),
        dailyReview: Math.max(5, Math.min(200, parsed.dailyReview ?? 30)),
        isDarkMode: !!parsed.isDarkMode,
      };
    }
  } catch {
    // ignore
  }
  return { dailyNew: 15, dailyReview: 30, isDarkMode: false };
}

function saveSettings(s: StoredSettings) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEYS.settings, JSON.stringify(s));
  } catch {
    // ignore
  }
}

function loadDailyStats(today: string): DailyStats {
  if (typeof window === "undefined") return { learnedCount: 0, reviewedCount: 0 };
  try {
    const raw = localStorage.getItem(`${STORAGE_KEYS.dailyStats}-${today}`);
    if (raw) return JSON.parse(raw) as DailyStats;
  } catch {
    // ignore
  }
  return { learnedCount: 0, reviewedCount: 0 };
}

function saveDailyStats(today: string, stats: DailyStats) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(`${STORAGE_KEYS.dailyStats}-${today}`, JSON.stringify(stats));
  } catch {
    // ignore
  }
}

function getTodayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function mapRowToWordItem(row: SupabaseWordRow): WordItem {
  const nextReviewDate = row.next_review_date ?? getTodayStr();
  return {
    id: row.id,
    word: row.word,
    translation: row.translation,
    isVerb: row.is_verb,
    isIrregular: row.is_verb && row.conjugations != null,
    conjugations: row.conjugations,
    example: row.example ?? undefined,
    interval: row.interval ?? 0,
    easeFactor: row.ease_factor ?? 2.5,
    nextReviewDate: typeof nextReviewDate === "string" ? nextReviewDate : getTodayStr(),
  };
}

function applySM2(word: WordItem, rating: "hard" | "good" | "easy"): WordItem {
  const today = getTodayStr();
  let interval = word.interval;
  let easeFactor = word.easeFactor;

  if (rating === "hard") {
    interval = 1;
    easeFactor = Math.max(1.3, easeFactor - 0.15);
  } else if (rating === "good") {
    interval = interval === 0 ? 1 : Math.ceil(interval * 1.2);
  } else if (rating === "easy") {
    if (interval === 0) interval = 1;
    else if (interval === 1) interval = 6;
    else interval = Math.ceil(interval * easeFactor);
    easeFactor = easeFactor + 0.15;
  }

  const nextReviewDate = addDays(today, interval);
  return { ...word, interval, easeFactor, nextReviewDate };
}

export default function Page() {
  const [words, setWords] = useState<WordItem[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabType>("study");
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [dailyNew, setDailyNew] = useState(15);
  const [dailyReview, setDailyReview] = useState(30);
  const [isRevealed, setIsRevealed] = useState(false);
  const [expandedWordId, setExpandedWordId] = useState<number | null>(null);
  const [updatingId, setUpdatingId] = useState<number | null>(null);
  const [dailyStats, setDailyStats] = useState<DailyStats>({ learnedCount: 0, reviewedCount: 0 });

  useEffect(() => {
    const s = loadSettings();
    setDailyNew(s.dailyNew);
    setDailyReview(s.dailyReview);
    setIsDarkMode(s.isDarkMode);
  }, []);

  useEffect(() => {
    setDailyStats(loadDailyStats(getTodayStr()));
  }, []);

  useEffect(() => {
    async function fetchWords() {
      setLoading(true);
      setError(null);
      const { data, error: err } = await supabase
        .from("words")
        .select("*")
        .order("id", { ascending: true });

      if (err) {
        setError(err.message ?? "获取词库失败");
        setWords([]);
      } else if (data && Array.isArray(data)) {
        setWords(
          (data as SupabaseWordRow[]).map(mapRowToWordItem)
        );
      } else {
        setWords([]);
      }
      setLoading(false);
    }

    fetchWords();
  }, []);

  const today = getTodayStr();
  const stats = dailyStats;

  const dueReviews = words
    ? words.filter((w) => w.interval > 0 && w.nextReviewDate <= today)
    : [];
  const newWords = words
    ? words.filter((w) => w.interval === 0)
    : [];

  const reviewSlice = dueReviews.slice(0, Math.max(0, dailyReview - stats.reviewedCount));
  const newSlice = newWords.slice(0, Math.max(0, dailyNew - stats.learnedCount));
  const studyQueue = [...reviewSlice, ...newSlice];
  const currentWord = studyQueue[0];
  const isCompleted = studyQueue.length === 0;

  useEffect(() => {
    setIsRevealed(false);
  }, [currentWord?.id]);

  const baseClasses = isDarkMode
    ? "bg-gray-900 text-gray-100 transition-colors duration-300"
    : "bg-gray-50 text-gray-900 transition-colors duration-300";

  const cardClasses = isDarkMode
    ? "bg-gray-800 text-gray-100"
    : "bg-white text-gray-900";

  const navClasses = isDarkMode
    ? "bg-gray-800 border-gray-700"
    : "bg-white border-gray-200";

  const handleRate = useCallback(
    async (rating: "hard" | "good" | "easy") => {
      if (!currentWord || !words) return;

      const wasNew = currentWord.interval === 0;
      const updated = applySM2(currentWord, rating);
      setUpdatingId(currentWord.id);

      const { error: updateErr } = await supabase
        .from("words")
        .update({
          interval: updated.interval,
          ease_factor: updated.easeFactor,
          next_review_date: updated.nextReviewDate,
        })
        .eq("id", currentWord.id);

      if (updateErr) {
        setError(updateErr.message ?? "同步失败");
      } else {
        setWords((prev) =>
          prev ? prev.map((w) => (w.id === updated.id ? updated : w)) : []
        );
        const nextStats = wasNew
          ? { ...stats, learnedCount: stats.learnedCount + 1 }
          : { ...stats, reviewedCount: stats.reviewedCount + 1 };
        setDailyStats(nextStats);
        saveDailyStats(getTodayStr(), nextStats);
      }

      setUpdatingId(null);
      setIsRevealed(true);
    },
    [currentWord, words, stats]
  );

  const toggleTheme = useCallback(() => {
    setIsDarkMode((prev) => {
      const next = !prev;
      saveSettings({ dailyNew, dailyReview, isDarkMode: next });
      return next;
    });
  }, [dailyNew, dailyReview, isDarkMode]);

  const handleDailyNewChange = useCallback(
    (v: number) => {
      setDailyNew(v);
      saveSettings({ dailyNew: v, dailyReview, isDarkMode });
    },
    [dailyReview, isDarkMode]
  );

  const handleDailyReviewChange = useCallback(
    (v: number) => {
      setDailyReview(v);
      saveSettings({ dailyNew, dailyReview: v, isDarkMode });
    },
    [dailyNew, isDarkMode]
  );

  if (loading) {
    return (
      <div
        className={`min-h-screen max-w-md mx-auto flex flex-col items-center justify-center ${baseClasses}`}
      >
        <p className="text-gray-500 dark:text-gray-400">加载中...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div
        className={`min-h-screen max-w-md mx-auto flex flex-col items-center justify-center p-6 ${baseClasses}`}
      >
        <p className="text-red-500 dark:text-red-400 text-center">{error}</p>
      </div>
    );
  }

  return (
    <div
      className={`min-h-screen max-w-md mx-auto flex flex-col ${baseClasses}`}
    >
      <header className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700 sticky top-0 z-10 bg-inherit backdrop-blur-sm">
        <h1 className="text-lg font-semibold">{TAB_TITLES[activeTab]}</h1>
        <button
          type="button"
          onClick={toggleTheme}
          className="p-2.5 rounded-xl active:scale-95 transition-all duration-200 hover:bg-gray-200/80 dark:hover:bg-gray-700/80"
          aria-label="切换深浅色"
        >
          {isDarkMode ? "☀️" : "🌙"}
        </button>
      </header>

      <main className="flex-1 overflow-y-auto p-4 pb-24">
        {activeTab === "study" && (
          <StudyView
            dailyNew={dailyNew}
            dailyReview={dailyReview}
            learnedToday={stats.learnedCount}
            reviewedToday={stats.reviewedCount}
            currentWord={currentWord}
            isCompleted={isCompleted}
            isRevealed={isRevealed}
            onReveal={() => setIsRevealed(true)}
            onRate={handleRate}
            cardClasses={cardClasses}
            isDarkMode={isDarkMode}
            isUpdating={updatingId === currentWord?.id}
          />
        )}

        {activeTab === "library" && (
          <LibraryView
            words={words ?? []}
            expandedWordId={expandedWordId}
            onExpand={setExpandedWordId}
            isDarkMode={isDarkMode}
          />
        )}

        {activeTab === "settings" && (
          <SettingsView
            dailyNew={dailyNew}
            dailyReview={dailyReview}
            onDailyNewChange={handleDailyNewChange}
            onDailyReviewChange={handleDailyReviewChange}
            isDarkMode={isDarkMode}
          />
        )}
      </main>

      <nav
        className={`fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-md flex border-t ${navClasses} transition-colors duration-300 safe-area-pb`}
      >
        {(["study", "library", "settings"] as const).map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setActiveTab(tab)}
            className={`flex-1 py-4 flex flex-col items-center justify-center gap-0.5 min-h-[56px] active:scale-95 transition-all duration-200 ${
              activeTab === tab
                ? isDarkMode
                  ? "text-amber-400"
                  : "text-blue-600"
                : isDarkMode
                  ? "text-gray-400"
                  : "text-gray-500"
            }`}
          >
            <span className="text-lg">
              {tab === "study" ? "📚" : tab === "library" ? "📖" : "⚙️"}
            </span>
            <span className="text-xs font-medium">{TAB_TITLES[tab]}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}

function StudyView({
  dailyNew,
  dailyReview,
  learnedToday,
  reviewedToday,
  currentWord,
  isCompleted,
  isRevealed,
  onReveal,
  onRate,
  cardClasses,
  isDarkMode,
  isUpdating,
}: {
  dailyNew: number;
  dailyReview: number;
  learnedToday: number;
  reviewedToday: number;
  currentWord: WordItem | undefined;
  isCompleted: boolean;
  isRevealed: boolean;
  onReveal: () => void;
  onRate: (rating: "hard" | "good" | "easy") => void | Promise<void>;
  cardClasses: string;
  isDarkMode: boolean;
  isUpdating?: boolean;
}) {
  const translationText = isDarkMode ? "text-gray-100" : "text-gray-900";

  return (
    <div className="space-y-4">
      <div className="flex gap-4 text-sm">
        <div className="flex-1 rounded-xl p-3 bg-gray-100/80 dark:bg-gray-800/80 backdrop-blur-sm">
          <p className="text-gray-500 dark:text-gray-400">今日新词</p>
          <p className="font-semibold mt-0.5 text-gray-900 dark:text-gray-100">
            {learnedToday} <span className="text-gray-400">/ {dailyNew}</span>
          </p>
        </div>
        <div className="flex-1 rounded-xl p-3 bg-gray-100/80 dark:bg-gray-800/80 backdrop-blur-sm">
          <p className="text-gray-500 dark:text-gray-400">今日复习</p>
          <p className="font-semibold mt-0.5 text-gray-900 dark:text-gray-100">
            {reviewedToday} <span className="text-gray-400">/ {dailyReview}</span>
          </p>
        </div>
      </div>

      {isCompleted ? (
        <div
          className={`${cardClasses} rounded-3xl shadow-xl p-12 text-center transition-opacity duration-300`}
        >
          <p className="text-2xl font-semibold">
            🎉 今天的学习任务已全部完成！明天再来吧！
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          <button
            type="button"
            onClick={!isRevealed ? onReveal : undefined}
            className={`w-full ${cardClasses} rounded-3xl shadow-xl p-10 min-h-[220px] transition-all duration-300 text-left block ${
              !isRevealed ? "cursor-pointer hover:scale-[1.01] active:scale-[0.99]" : "cursor-default"
            }`}
          >
            {currentWord && (
              <>
                <p
                  className={`text-5xl font-bold ${
                    isDarkMode ? "text-gray-100" : "text-gray-900"
                  }`}
                >
                  {currentWord.word}
                </p>

                {!isRevealed ? (
                  <p className="mt-6 text-sm text-gray-500 dark:text-gray-400">
                    点击卡片查看释义
                  </p>
                ) : (
                  <div className="mt-6 space-y-4 transition-all duration-300">
                    <p className={`text-2xl font-bold ${translationText}`}>
                      {currentWord.translation}
                    </p>

                    {currentWord.isVerb &&
                      currentWord.isIrregular &&
                      currentWord.conjugations && (
                        <div
                          className={`rounded-xl p-3 ${
                            isDarkMode ? "bg-gray-700/60" : "bg-gray-100"
                          }`}
                        >
                          <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">
                            不规则变位
                          </p>
                          <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
                            {CONJUGATION_KEYS.filter(
                              (k) => k in currentWord.conjugations!
                            ).map((key) => (
                              <div
                                key={key}
                                className="flex justify-between items-center"
                              >
                                <span className={isDarkMode ? "text-gray-400" : "text-gray-600"}>
                                  {key}:
                                </span>
                                <span className={`font-semibold ${translationText}`}>
                                  {currentWord.conjugations![key]}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                    {currentWord.example && (
                      <div
                        className={`rounded-xl p-3 ${
                          isDarkMode ? "bg-gray-700/60" : "bg-gray-100"
                        } space-y-1.5`}
                      >
                        <p className={`text-sm italic ${isDarkMode ? "text-gray-200" : "text-gray-800"}`}>
                          {currentWord.example.pt}
                        </p>
                        <p className={`text-sm ${translationText} opacity-90`}>
                          {currentWord.example.zh}
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </button>

          {!isRevealed ? (
            <p className="text-center text-xs text-gray-500 dark:text-gray-400">
              看完释义后，下方选择掌握程度
            </p>
          ) : (
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => onRate("hard")}
                disabled={isUpdating}
                className="flex-1 h-14 min-h-[44px] bg-red-500 text-white rounded-2xl font-medium transition-all duration-200 active:scale-95 hover:bg-red-600 shadow-lg shadow-red-500/25 disabled:opacity-70 disabled:cursor-not-allowed"
              >
                {isUpdating ? "同步中..." : "不认识"}
              </button>
              <button
                type="button"
                onClick={() => onRate("good")}
                disabled={isUpdating}
                className="flex-1 h-14 min-h-[44px] bg-amber-400 text-gray-800 rounded-2xl font-medium transition-all duration-200 active:scale-95 hover:bg-amber-500 shadow-lg shadow-amber-400/25 disabled:opacity-70 disabled:cursor-not-allowed"
              >
                模糊
              </button>
              <button
                type="button"
                onClick={() => onRate("easy")}
                disabled={isUpdating}
                className="flex-1 h-14 min-h-[44px] bg-emerald-500 text-white rounded-2xl font-medium transition-all duration-200 active:scale-95 hover:bg-emerald-600 shadow-lg shadow-emerald-500/25 disabled:opacity-70 disabled:cursor-not-allowed"
              >
                认识
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function LibraryView({
  words,
  expandedWordId,
  onExpand,
  isDarkMode,
}: {
  words: WordItem[];
  expandedWordId: number | null;
  onExpand: (id: number | null) => void;
  isDarkMode: boolean;
}) {
  const itemBg = isDarkMode ? "bg-gray-800" : "bg-white";
  const itemBorder = isDarkMode ? "border-gray-700" : "border-gray-200";
  const transColor = isDarkMode ? "text-gray-300" : "text-gray-700";
  const expandBg = isDarkMode ? "bg-gray-700/50" : "bg-gray-50";

  return (
    <div className="space-y-2">
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">
        共 {words.length} 个词，点击展开查看详情
      </p>
      <ul className="space-y-2">
        {words.map((word) => {
          const isExpanded = expandedWordId === word.id;
          return (
            <li key={word.id}>
              <button
                type="button"
                onClick={() => onExpand(isExpanded ? null : word.id)}
                className={`w-full ${itemBg} rounded-2xl p-4 flex items-center justify-between text-left border ${itemBorder} transition-all duration-200 active:scale-[0.99] cursor-pointer`}
              >
                <div className="flex flex-col items-start gap-1">
                  <span className={`text-lg font-semibold ${isDarkMode ? "text-gray-100" : "text-gray-900"}`}>
                    {word.word}
                  </span>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs text-gray-500 dark:text-gray-400">
                      {word.isVerb ? "动词" : "名词"}
                    </span>
                    {word.interval > 0 && (
                      <span className="text-xs text-gray-400 dark:text-gray-500">
                        间隔 {word.interval} 天 · 下次 {word.nextReviewDate}
                      </span>
                    )}
                  </div>
                </div>
                <span className={`font-medium ${transColor} text-base ml-2`}>
                  {word.translation}
                </span>
                <span className="ml-2 text-gray-400 text-lg">{isExpanded ? "▲" : "▼"}</span>
              </button>

              {isExpanded && (
                <div
                  className={`mt-2 rounded-xl p-4 ${expandBg} border ${itemBorder} space-y-4`}
                >
                  <div>
                    <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">释义</p>
                    <p className={`font-semibold ${isDarkMode ? "text-gray-100" : "text-gray-900"}`}>
                      {word.translation}
                    </p>
                  </div>

                  {word.isVerb && word.conjugations && (
                    <div>
                      <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">变位</p>
                      <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                        {CONJUGATION_KEYS.filter((k) => k in word.conjugations!).map((key) => (
                          <div key={key} className="flex justify-between">
                            <span className="text-gray-500 dark:text-gray-400">{key}:</span>
                            <span className={isDarkMode ? "text-gray-200 font-medium" : "text-gray-800 font-medium"}>
                              {word.conjugations![key]}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {word.example && (
                    <div>
                      <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">例句</p>
                      <p className={`text-sm italic mb-1 ${isDarkMode ? "text-gray-200" : "text-gray-800"}`}>
                        {word.example.pt}
                      </p>
                      <p className={`text-sm ${transColor}`}>{word.example.zh}</p>
                    </div>
                  )}

                  <div className="text-xs text-gray-500 dark:text-gray-400 pt-2 border-t border-gray-200 dark:border-gray-600">
                    间隔 {word.interval} 天 · 简易度 {word.easeFactor.toFixed(1)} · 下次复习 {word.nextReviewDate}
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function SettingsView({
  dailyNew,
  dailyReview,
  onDailyNewChange,
  onDailyReviewChange,
  isDarkMode,
}: {
  dailyNew: number;
  dailyReview: number;
  onDailyNewChange: (v: number) => void;
  onDailyReviewChange: (v: number) => void;
  isDarkMode: boolean;
}) {
  const panelBg = isDarkMode ? "bg-gray-800" : "bg-white";
  const panelBorder = isDarkMode ? "border-gray-700" : "border-gray-200";

  const Stepper = ({
    value,
    onChange,
    min = 5,
    max = 100,
    label,
  }: {
    value: number;
    onChange: (v: number) => void;
    min?: number;
    max?: number;
    label: string;
  }) => (
    <div
      className={`rounded-2xl p-4 border ${panelBg} ${panelBorder} transition-colors duration-300`}
    >
      <p className="text-sm font-medium mb-3">{label}</p>
      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={() => onChange(Math.max(min, value - 5))}
          className="w-12 h-12 rounded-xl bg-gray-200 dark:bg-gray-700 flex items-center justify-center text-xl font-bold active:scale-95 transition-all disabled:opacity-50 hover:bg-gray-300 dark:hover:bg-gray-600"
          disabled={value <= min}
        >
          −
        </button>
        <span className="flex-1 text-center text-2xl font-bold">{value}</span>
        <button
          type="button"
          onClick={() => onChange(Math.min(max, value + 5))}
          className="w-12 h-12 rounded-xl bg-gray-200 dark:bg-gray-700 flex items-center justify-center text-xl font-bold active:scale-95 transition-all disabled:opacity-50 hover:bg-gray-300 dark:hover:bg-gray-600"
          disabled={value >= max}
        >
          +
        </button>
      </div>
    </div>
  );

  return (
    <div className="space-y-4">
      <Stepper
        value={dailyNew}
        onChange={onDailyNewChange}
        label="每日新词数量"
      />
      <Stepper
        value={dailyReview}
        onChange={onDailyReviewChange}
        label="每日复习数量"
      />
      <div
        className={`rounded-2xl p-4 border ${panelBg} ${panelBorder} transition-colors duration-300`}
      >
        <p className="text-sm font-medium mb-2">词库来源</p>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          词库数据来自 Supabase 云端 <code className="px-1 py-0.5 rounded bg-gray-200 dark:bg-gray-700">words</code> 表
        </p>
      </div>
    </div>
  );
}
