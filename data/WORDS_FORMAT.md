# 词库 JSON 拓展格式说明

将新单词追加到 `words.json` 数组中即可拓展词库。

## 完整字段说明

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `id` | number | ✓ | 唯一标识，建议递增 |
| `word` | string | ✓ | 葡语单词 |
| `translation` | string | ✓ | 中文释义（纯文本，不含标点/例句） |
| `isVerb` | boolean | ✓ | 是否为动词 |
| `isIrregular` | boolean | ✓ | 动词专用，是否不规则（仅不规则动词显示变位） |
| `conjugations` | object \| null | 动词必填 | 变位表，不含 tu，格式见下 |
| `example` | object | 可选 | 例句 { pt, zh } |
| `interval` | number | ✓ | 复习间隔（算法用） |
| `easeFactor` | number | ✓ | 难度系数（算法用） |

## 变位表格式（conjugations）

仅 `isVerb: true` 且 `isIrregular: true` 时展示，**不需要 tu**：

```json
{
  "eu": "faço",
  "ele/ela/você": "faz",
  "nós": "fazemos",
  "eles/elas/vocês": "fazem"
}
```

## 例句格式（example）

```json
{
  "pt": "Eu faço o café.",
  "zh": "我做咖啡。"
}
```

## 完整示例

```json
{
  "id": 9,
  "word": "querer",
  "translation": "想",
  "isVerb": true,
  "isIrregular": true,
  "conjugations": {
    "eu": "quero",
    "ele/ela/você": "quer",
    "nós": "queremos",
    "eles/elas/vocês": "querem"
  },
  "example": {
    "pt": "Quero aprender português.",
    "zh": "我想学葡萄牙语。"
  },
  "interval": 0,
  "easeFactor": 2.5
}
```
