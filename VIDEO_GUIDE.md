# 學習影片嵌入

已將 `output` 的五支 MP4 複製到網站 `videos/`，放在各頁標題後、第一段文字前。來源檔不修改，檔案雜湊記錄於 `videos/manifest.json`。

| 學習頁 | 影片 | 約略長度 |
| --- | --- | --- |
| 1.html | 維管束的功能與分布 | 73.1 秒 |
| 2.html | 莖內維管束排列 | 64.0 秒 |
| 3.html | 樹皮與年輪 | 89.7 秒 |
| 5.html | 植物體內的養分運輸 | 55.3 秒 |
| 6.html | 植物體內的水分運輸 | 99.3 秒 |

全部為 1920×1080、H.264／AAC，合計 76,829,481 bytes（約 77 MB）。保留原畫質，未重新壓縮；封面為原片第 1 秒的畫面。

播放器具播放、暫停、進度、音量及全螢幕控制，支援手機頁內播放。設定 `preload="metadata"`，由瀏覽器決定預載策略；不自動播放、不強制看完才開放練習。

目前採直接 MP4，學生不需跳到其他平台。正式部署時，須連同 `videos/` 上傳網站，僅更新 HTML 不會有影片。發布在公開網站後，這些影片也會是可公開存取的資源。

影片總量在目前 GitHub Pages 網站容量上限之內。若日後使用量增加，可考慮改為 YouTube 嵌入，減少網站承擔的影片傳輸流量。GitHub Pages 的網站容量上限為 1 GB，月流量軟上限為 100 GB；這不是無限流量的串流影音服務。

來源：[GitHub Pages 使用限制](https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits)、[MDN video 元素](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/video)。

含影片、學習歷程計分與座號 1～30 限制的新版預覽：`http://127.0.0.1:8768/index.html`。保留舊的預覽程序，以保護先前的模擬工作表紀錄；新預覽使用獨立儲存空間。

若之後要重新開啟預覽，可在此網站目錄執行 `node tools/local-preview.cjs`，再開啟上述網址。預覽端點會使用記憶體模擬試算表；不要把一般靜態伺服器和這個模擬模式混淆。關閉預覽程序會清除模擬工作表資料。

播放驗證可在啟動新版預覽後執行 `node tests/videos.test.cjs`。正式網站已發布，五支影片的 HTTP 206 分段載入與第 1 頁影片啟動播放已確認；影片旁白與內容未另做完整人工審稿。
