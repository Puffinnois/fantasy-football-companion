| Model      | Mode                 | Valid | Right (20) | Right when the resolver found the metric (18) | p50 s | p90 s |
| ---------- | -------------------- | ----- | ---------- | --------------------------------------------- | ----- | ----- |
| gemma3:4b  | json+thought         | 19    | 4          | 4                                             | 2.1   | 3.0   |
| gemma3:4b  | json                 | 18    | 2          | 2                                             | 1.3   | 1.9   |
| gemma3:4b  | free json            | 4     | 3          | 3                                             | 1.9   | 2.8   |
| gemma3:4b  | classified           | 20    | 10         | 10                                            | 1.5   | 2.5   |
| gemma3:4b  | classified v3        | 20    | 15         | 15                                            | 1.3   | 1.6   |
| gemma3:4b  | json+thought slim v3 | 8     | 6          | 6                                             | 1.4   | 1.6   |
| gemma3:12b | json+thought         | 20    | 8          | 8                                             | 8.6   | 11.3  |
| gemma3:12b | json                 | 19    | 6          | 6                                             | 4.5   | 6.5   |
| gemma3:12b | free json            | 3     | 3          | 3                                             | 7.7   | 9.7   |
| gemma3:12b | classified           | 20    | 10         | 10                                            | 6.7   | 8.1   |
| gemma3:12b | classified v3        | 20    | 17         | 17                                            | 5.2   | 6.1   |
| gemma3:12b | json+thought slim v3 | 18    | 9          | 9                                             | 6.2   | 8.2   |
| qwen3:4b   | native think         | 18    | 16         | 16                                            | 17.9  | 27.1  |
| qwen3:4b   | json+thought         | 19    | 9          | 9                                             | 4.0   | 5.1   |
| qwen3:4b   | classified v3        | 19    | 15         | 15                                            | 2.5   | 3.7   |
| qwen3:4b   | native               | 18    | 16         | 16                                            | 18.7  | 26.1  |
| qwen3:4b   | native v3            | 16    | 6          | 6                                             | 13.7  | 30.8  |

| Model      | Path | Ran first time | Right first time (15) | Right after one retry with the error | Rankings right (10) | Lookups right (5) | p50 s |
| ---------- | ---- | -------------- | --------------------- | ------------------------------------ | ------------------- | ----------------- | ----- |
| gemma3:12b | dsl  | 0              | 0                     | 0                                    | 0                   | 0                 | 16.9  |
| gemma3:12b | sql  | 10             | 9                     | 10                                   | 5                   | 5                 | 28.5  |
| qwen3:4b   | dsl  | 0              | 0                     | 0                                    | 0                   | 0                 | 2.3   |
| qwen3:4b   | sql  | 5              | 4                     | 4                                    | 1                   | 3                 | 16.8  |
| gemma3:12b | dsl2 | 15             | 9                     | 9                                    | 9                   | 0                 | 8.8   |
| qwen3:4b   | dsl2 | 15             | 9                     | 9                                    | 8                   | 1                 | 1.0   |
