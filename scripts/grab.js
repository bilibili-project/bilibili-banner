/*
 * BannerGrabber - Bilibili Banner 资源抓取工具
 * 用法: node scripts/grab.js <banner名称>
 * 示例: node scripts/grab.js "大海之上 - 鳄鱼"
 *
 * 功能：
 *  1. 启动 Puppeteer 访问 bilibili.com
 *  2. 抓取 .animated-banner 下所有图层的变换数据
 *  3. 模拟鼠标偏移，计算各图层加速度参数 a
 *  4. 下载所有图层资源到 public/assets/<date>/
 *  5. 生成 data.json 并更新 BannerDataLoader.js 的 MANIFEST
 */

const puppeteer = require("puppeteer");
const fs = require("node:fs");
const path = require("node:path");

// ─────────────────────── 工具函数 ───────────────────────

/**
 * 延迟指定时间
 * @param {number} ms - 毫秒数
 * @returns {Promise<void>}
 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ─────────────────────── 主类 ───────────────────────

/**
 * Banner 资源抓取器
 */
class BannerGrabber {
  /**
   * @param {string} bannerName - Banner 展示名称（写入 MANIFEST 的 name 字段）
   */
  constructor(bannerName) {
    this.bannerName = bannerName;
    this.data = [];

    // 生成今日日期字符串
    const today = new Date();
    const y = today.getFullYear();
    const m = String(today.getMonth() + 1).padStart(2, "0");
    const d = String(today.getDate()).padStart(2, "0");
    this.date = `${y}-${m}-${d}`;

    this.saveFolder = path.resolve(__dirname, `../public/assets/${this.date}`);
    this.dataLoaderPath = path.resolve(
      __dirname,
      "../src/core/BannerDataLoader.ts",
    );
  }

  /**
   * 主流程入口
   */
  async run() {
    this._prepareFolder();
    await this._scrape();
    this._writeDataJson();
    this._updateManifest();
    console.log("✅ 完成！运行 pnpm dev 查看效果。");
  }

  // ─────────────── 私有方法 ───────────────

  /**
   * 准备保存目录：不存在则新建，已存在则清空
   * @private
   */
  _prepareFolder() {
    if (fs.existsSync(this.saveFolder)) {
      fs.readdirSync(this.saveFolder).forEach((file) => {
        fs.unlinkSync(path.join(this.saveFolder, file));
      });
      console.log(`🗑  已清空 ${this.saveFolder}`);
    } else {
      fs.mkdirSync(this.saveFolder, { recursive: true });
      console.log(`📁 已创建 ${this.saveFolder}`);
    }
  }

  /**
   * 启动 Puppeteer 并执行完整抓取流程
   * @private
   */
  async _scrape() {
    const executablePath = process.env.PUPPETEER_EXECUTABLE_PATH;
    if (!executablePath) {
      throw new Error(
        "❌ 未找到浏览器路径。请在 .env 文件中配置 PUPPETEER_EXECUTABLE_PATH，或在运行命令时通过环境变量指定。\n示例内容: PUPPETEER_EXECUTABLE_PATH=C:\\Programs\\chrome.exe",
      );
    }

    const browser = await puppeteer.launch({
      headless: "new",
      executablePath,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });
    const page = await browser.newPage();
    await page.setViewport({ width: 1650, height: 800 });

    try {
      console.log("🌐 正在加载页面...");
      await page.goto("https://www.bilibili.com/", {
        waitUntil: "domcontentloaded",
      });
      await sleep(1000);
      await page.goto("https://www.bilibili.com/", {
        waitUntil: "domcontentloaded",
      });
      await page.waitForSelector(".animated-banner");
      await sleep(2000);

      // 第一遍：获取图层基础数据并下载资源
      console.log("📥 正在下载资源...");
      await this._fetchLayers(page);

      // 模拟鼠标偏移
      const element = await page.$(".animated-banner");
      const { x, y, width } = await element.boundingBox();
      const centerX = x + width / 2;
      const centerY = y + 50;

      // ====== 右移 ======
      await page.mouse.move(centerX, centerY);
      await sleep(500);
      await page.mouse.move(centerX + 1000, centerY, { steps: 5 });
      await sleep(1500);
      await this._calculateOffsetParams(page, "right", 1000);

      // 离开恢复
      await page.mouse.move(centerX, centerY - 200);
      await sleep(500);

      // ====== 左移 ======
      await page.mouse.move(centerX, centerY);
      await sleep(500);
      await page.mouse.move(centerX - 1000, centerY, { steps: 5 });
      await sleep(1500);
      await this._calculateOffsetParams(page, "left", -1000);

      // 综合处理
      this._finalizeData();
    } catch (error) {
      console.error("❌ 抓取出错:", error);
    } finally {
      await browser.close();
    }
  }

  /**
   * 获取所有图层的变换数据，并逐一下载资源
   * @param {import('puppeteer').Page} page
   * @private
   */
  async _fetchLayers(page) {
    const layerElements = await page.$$(".animated-banner .layer");
    for (const layerEl of layerElements) {
      const layerData = await page.evaluate((el) => {
        const child = el.firstElementChild;
        const style = window.getComputedStyle(child);
        const matrix = new DOMMatrix(style.transform);

        return {
          tagName: child.tagName.toLowerCase(),
          opacity: [
            parseFloat(style.opacity),
            parseFloat(style.opacity),
            parseFloat(style.opacity),
          ],
          transform: [
            matrix.a,
            matrix.b,
            matrix.c,
            matrix.d,
            matrix.e,
            matrix.f,
          ],
          width: parseFloat(style.width),
          height: parseFloat(style.height),
          src: child.src,
          blur: parseFloat(
            (style.filter.match(/blur\((.+?)px\)/) || [0, 0])[1],
          ),
          a: 0.01,
        };
      }, layerEl);

      await this._downloadFile(layerData, page);
    }
  }

  async _calculateOffsetParams(page, direction, moveDist) {
    const layerElements = await page.$$(".animated-banner .layer");
    for (let i = 0; i < layerElements.length; i++) {
      const state = await page.evaluate((el) => {
        const style = window.getComputedStyle(el.firstElementChild);
        const matrix = new DOMMatrix(style.transform);
        let blur = 0;
        const filterStr = style.filter;
        if (filterStr && filterStr !== "none") {
          const match = filterStr.match(/blur\((.+?)px\)/);
          if (match) blur = parseFloat(match[1]);
        }
        return {
          skewX: matrix.e,
          opacity: parseFloat(style.opacity),
          blur: blur,
        };
      }, layerElements[i]);

      const item = this.data[i];
      if (!item.temp) item.temp = {};

      const origX = item.transform[4] || 0;
      const a = (state.skewX - origX) / moveDist;

      item.temp[direction] = {
        a: a,
        opacity: state.opacity,
        blur: state.blur,
      };
    }
  }

  _finalizeData() {
    // 假设 1650 屏幕宽度下偏移 1000 的拉扯比例
    const ratio = Math.min(1000 / (1650 / 2), 1);

    for (const item of this.data) {
      if (!item.temp) continue;

      const aRight = item.temp.right.a || 0;
      const aLeft = item.temp.left.a || 0;
      item.a = Number(((aRight + aLeft) / 2).toFixed(5));

      const defOp = item.opacity[0];
      const opRight =
        item.temp.right.opacity !== undefined &&
        !Number.isNaN(item.temp.right.opacity)
          ? item.temp.right.opacity
          : defOp;
      const opLeft =
        item.temp.left.opacity !== undefined &&
        !Number.isNaN(item.temp.left.opacity)
          ? item.temp.left.opacity
          : defOp;

      let finalOpRight = defOp + (opRight - defOp) / ratio;
      let finalOpLeft = defOp + (opLeft - defOp) / ratio;

      finalOpRight = Math.max(0, Math.min(1, finalOpRight));
      finalOpLeft = Math.max(0, Math.min(1, finalOpLeft));

      item.opacity = [
        defOp,
        Number(finalOpLeft.toFixed(2)),
        Number(finalOpRight.toFixed(2)),
      ];

      delete item.temp;
    }
  }

  /**
   * 下载单个资源文件，并将处理后的数据追加到 this.data
   * @param {object} item - 图层数据
   * @param {import('puppeteer').Page} page
   * @private
   */
  async _downloadFile(item, page) {
    const fileName = item.src.split("/").pop();
    const filePath = path.join(this.saveFolder, fileName);

    const content = await page.evaluate(async (url) => {
      const res = await fetch(url);
      const buffer = await res.arrayBuffer();
      return { buffer: Array.from(new Uint8Array(buffer)) };
    }, item.src);

    fs.writeFileSync(filePath, Buffer.from(content.buffer));
    // 将路径统一改为相对于 public 的格式
    const relativeSrc = `/assets/${this.date}/${fileName}`;
    this.data.push({ ...item, src: relativeSrc });
  }

  /**
   * 将抓取到的数据写入 data.json
   * @private
   */
  _writeDataJson() {
    const outputPath = path.join(this.saveFolder, "data.json");
    fs.writeFileSync(outputPath, JSON.stringify(this.data, null, 2));
    console.log(`💾 已写入 ${outputPath}`);
  }

  _updateManifest() {
    let code = fs.readFileSync(this.dataLoaderPath, "utf8");

    const newEntry = `    { date: "${this.date}", variants: [{ name: "${this.bannerName}" }] },`;

    // 在 ADD_NEW_DATA 注释前插入新条目
    code = code.replace(/(\s*\/\/\s*ADD_NEW_DATA)/, `\n${newEntry}$1`);

    fs.writeFileSync(this.dataLoaderPath, code);
    console.log(`📝 已更新 BannerDataLoader.ts MANIFEST`);
  }
}

// ─────────────────────── 入口 ───────────────────────

const bannerName = process.argv[2];
if (!bannerName) {
  console.error(
    '❌ Banner 未命名，请正确运行命令。\n示例: node scripts/grab.js "大海之上 - 鳄鱼"',
  );
  process.exit(1);
}

new BannerGrabber(bannerName).run();
