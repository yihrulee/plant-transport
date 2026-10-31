# 植物的運輸探索之旅

國中自然科互動學習網站，含五支學習影片、分頁練習、運輸挑戰賽、蒸散探究、20 題總評量與個人學習總表。

正式網站：[開始學習](https://yihrulee.github.io/plant-transport/index.html)。已於 2026-10-31 發布並完成正式成績上傳驗證，見 [發布驗證](RELEASE.md)。

學生在首頁填寫一次班級、1～30 的座號與姓名。學習頁依第一次答對 3 分、第二次 2 分、第三次以後 1 分累積，五頁共 57 分。右下角小方塊顯示班級、座號與累積分數。

## 頁面

- `index.html`：學生資料與課程入口。
- `1.html`～`6.html`：維管束、年輪、水分與養分運輸學習。
- `7.html`：植物的運輸挑戰賽。
- `8.html`：蒸散作用教學模擬與探究回答。
- `9.html`：20 題單選總評量，每題 5 分。
- `10.html`：學習歷程、挑戰賽與總評量總表。

## 部署與測試

先更新 `apps-script/Code.gs`，確認 `/exec` 回傳 `apiVersion: "plant-transport-v2"` 與 `learningVersion: "attempt-321-v1"`，再更新 GitHub Pages。所有頁面共用 `course-config.js` 的提交端點。

本機模擬可執行 `node tools/local-preview.cjs`；模擬資料只存在記憶體，不會送到正式試算表。

詳細資料：

- [部署說明](DEPLOYMENT.md)
- [學習歷程計分](LEARNING_SCORE_GUIDE.md)
- [影片對應](VIDEO_GUIDE.md)
- [題目與答案](ASSESSMENT_REVIEW.md)
- [檢查範圍與限制](FINAL_QA.md)

此為可重做的形成性學習工具，不提供正式考試的防作弊保證。蒸散數據為教學模擬，非真實量測。
