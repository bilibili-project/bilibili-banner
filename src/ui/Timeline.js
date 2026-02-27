/**
 * 时间轴 UI 控制器
 * 负责渲染年份选择器与 Banner 详情时间轴，并响应用户交互。
 */
export default class Timeline {
  /**
   * @param {import('../core/BannerEngine.js').default} engine - BannerEngine 实例
   * @param {object} [options]
   * @param {string} [options.yearBoxId='yearBox']   - 年份选择器容器 ID
   * @param {string} [options.selectBoxId='selectBox'] - 时间轴详情容器 ID
   */
  constructor(engine, options = {}) {
    this.engine = engine;
    this.data = [];
    this.currentYear = "";
    this._bodyDropdowns = []; // 追踪挂载到 body 的 dropdown，切年份时统一清理

    const {
      yearBoxId = "yearBox",
      selectBoxId = "selectBox",
      variantBoxId = "variantBox",
    } = options;
    this.yearBox = document.getElementById(yearBoxId);
    this.selectBox = document.getElementById(selectBoxId);
    this.variantBox = document.getElementById(variantBoxId);
  }

  /**
   * 初始化 UI：根据数据渲染年份和时间轴，并绑定交互事件
   * @param {Array<{date: string, variants: Array<{name: string, path: string, data: object}>}>} bannersData
   */
  init(bannersData) {
    if (!this.yearBox || !this.selectBox) return;

    this.data = bannersData;

    // 提取所有唯一年份（保持原始顺序，从 Set 中去重）
    const years = [
      ...new Set(bannersData.map((item) => item.date.split("-")[0])),
    ];
    this.currentYear = years[years.length - 1]; // 默认最新年份

    this._renderYears(years);
    this._renderBanners(this.currentYear);
    this._setupScrollWheel();
  }

  // ─────────────────────── 私有方法 ───────────────────────

  /**
   * 渲染年份选择器
   * @param {string[]} years
   * @private
   */
  _renderYears(years) {
    this.yearBox.innerHTML = "";

    years.forEach((year) => {
      const yearEl = document.createElement("div");
      yearEl.className = `year-item ${year === this.currentYear ? "active" : ""}`;
      yearEl.innerText = year;

      yearEl.addEventListener("click", () => {
        if (this.currentYear === year) return;
        this.currentYear = year;

        // 更新年份激活状态
        this.yearBox.querySelectorAll(".year-item").forEach((el) => {
          el.classList.remove("active");
        });
        yearEl.classList.add("active");

        // 刷新时间轴列表
        this._renderBanners(year);
      });

      this.yearBox.appendChild(yearEl);
    });
  }

  /**
   * 渲染指定年份的 Banner 详情时间轴
   * @param {string} year
   * @private
   */
  _renderBanners(year) {
    this._cleanupDropdowns(); // 切换年份时清理上一批 body-level dropdown
    this.selectBox.innerHTML = "";

    const filteredData = this.data.filter((item) => item.date.startsWith(year));

    filteredData.forEach((item, index) => {
      const isLatest = index === filteredData.length - 1;
      const itemEl = this._createTimelineItem(item, isLatest);
      this.selectBox.appendChild(itemEl);

      // 初始渲染时自动居中最新项
      if (isLatest) {
        setTimeout(() => {
          itemEl.scrollIntoView({
            behavior: "smooth",
            block: "nearest",
            inline: "center",
          });
        }, 100);
      }
    });

    // 默认展示该年最新项的第一个变体
    if (filteredData.length > 0) {
      const latestItem = filteredData[filteredData.length - 1];
      this.engine.updateData(latestItem.variants[0].data);
    }
  }

  /**
   * 清理所有挂载到 body 的 dropdown 元素
   * @private
   */
  _cleanupDropdowns() {
    this._bodyDropdowns.forEach((d) => {
      d.remove();
    });
    this._bodyDropdowns = [];
  }

  /**
   * 创建单个时间轴条目 DOM 元素（包含潜在的变体下拉菜单）
   * @param {{date: string, variants: Array}} item
   * @param {boolean} isActive - 是否默认激活（选中）
   * @returns {HTMLElement}
   * @private
   */
  _createTimelineItem(item, isActive) {
    const itemEl = document.createElement("div");
    itemEl.className = `timeline-item ${isActive ? "active" : ""}`;

    const content = document.createElement("div");
    content.className = "item-content";

    const dateStr = document.createElement("span");
    dateStr.className = "item-date";
    dateStr.innerText = item.date;

    const name = document.createElement("span");
    name.className = "item-name";

    // 文字单独放在子 span 中，避免更新时覆盖 SVG 子节点
    const nameText = document.createElement("span");
    nameText.innerText = item.variants[0].name.split(" - ")[0];
    name.appendChild(nameText);

    content.appendChild(dateStr);
    content.appendChild(name);
    itemEl.appendChild(content);

    // 有多个变体时生成 Hover 下拉菜单
    if (item.variants.length > 1) {
      itemEl.classList.add("has-variants");

      // 注入 Bilibili 原版 SVG 下拉箭头，使用 currentColor 自动继承文字颜色
      const arrow = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "svg",
      );
      arrow.setAttribute("width", "10");
      arrow.setAttribute("height", "10");
      arrow.setAttribute("viewBox", "0 0 9 9");
      arrow.setAttribute("fill", "none");
      arrow.classList.add("variant-arrow");
      arrow.innerHTML = `<path fill-rule="evenodd" clip-rule="evenodd" d="M7.50588 3.40623C7.40825 3.3086 7.24996 3.3086 7.15232 3.40623L4.41244 6.14612L1.67255 3.40623C1.57491 3.3086 1.41662 3.3086 1.31899 3.40623C1.22136 3.50386 1.22136 3.66215 1.31899 3.75978L4.11781 6.5586C4.28053 6.72132 4.54434 6.72132 4.70706 6.5586L7.50588 3.75978C7.60351 3.66215 7.60351 3.50386 7.50588 3.40623Z" fill="currentColor"/>`;
      name.appendChild(arrow);
      const dropdown = document.createElement("div");
      dropdown.className = "variant-dropdown";

      item.variants.forEach((variant, index) => {
        const btn = document.createElement("div");
        btn.className = `variant-item ${index === 0 && isActive ? "active" : ""}`;
        btn.innerText = variant.name;

        btn.addEventListener("click", (e) => {
          // 阻止事件冒泡，防止触发最外层的点击事件导致重复刷新
          e.stopPropagation();

          // 1. 更新最外层的选中状态
          this.selectBox.querySelectorAll(".timeline-item").forEach((el) => {
            el.classList.remove("active");
          });
          itemEl.classList.add("active");

          // 2. 更新浮层内的选中状态
          dropdown.querySelectorAll(".variant-item").forEach((el) => {
            el.classList.remove("active");
          });
          btn.classList.add("active");

          // 3. 更新时间轴条目显示的名字
          nameText.innerText = variant.name.split(" - ")[0];

          // 4. 触发渲染
          this.engine.updateData(variant.data);
        });

        dropdown.appendChild(btn);
      });

      // ── Portal：将 dropdown 挂载到 body，脱离 overflow 容器截断 ──
      document.body.appendChild(dropdown);
      this._bodyDropdowns.push(dropdown);

      // JS hover 控制：mouseenter 计算 fixed 坐标并显示，mouseleave 延迟隐藏
      let hideTimer = null;

      const showDropdown = () => {
        clearTimeout(hideTimer);
        const rect = itemEl.getBoundingClientRect();
        dropdown.style.top = `${rect.bottom + 8}px`;
        dropdown.style.left = `${rect.left + rect.width / 2}px`;
        dropdown.classList.add("visible");
      };

      const hideDropdown = () => {
        hideTimer = setTimeout(() => dropdown.classList.remove("visible"), 150);
      };

      itemEl.addEventListener("mouseenter", showDropdown);
      itemEl.addEventListener("mouseleave", hideDropdown);
      dropdown.addEventListener("mouseenter", () => clearTimeout(hideTimer));
      dropdown.addEventListener("mouseleave", hideDropdown);
    }

    // 点击整个包裹 DOM 时（例如只包含单个项，或直接点击标题）加载第一个变体
    itemEl.addEventListener("click", () => {
      this.selectBox.querySelectorAll(".timeline-item").forEach((el) => {
        el.classList.remove("active");
      });
      itemEl.classList.add("active");

      // 如果它内部有 dropdown，默认激活第一个变体按钮的样式
      const firstVariantBtn = itemEl.querySelector(".variant-item");
      if (firstVariantBtn) {
        itemEl.querySelectorAll(".variant-item").forEach((el) => {
          el.classList.remove("active");
        });
        firstVariantBtn.classList.add("active");
      }

      // 名字恢复为第一个变体的名字
      nameText.innerText = item.variants[0].name.split(" - ")[0];

      this.engine.updateData(item.variants[0].data);
    });

    return itemEl;
  }

  /**
   * 绑定时间轴的横向滚轮事件
   * @private
   */
  _setupScrollWheel() {
    const bindWheelScroll = (el) => {
      el.addEventListener("wheel", (e) => {
        if (e.deltaY !== 0) {
          e.preventDefault();
          el.scrollLeft += e.deltaY;
        }
      });
    };
    bindWheelScroll(this.selectBox);
    bindWheelScroll(this.yearBox);
  }
}
