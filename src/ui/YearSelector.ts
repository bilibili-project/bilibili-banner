export interface YearSelectorOptions {
  containerId?: string;
  onYearChange?: (year: string) => void;
}

export default class YearSelector {
  private container: HTMLElement | null;
  private currentYear: string = "";
  private onYearChange: ((year: string) => void) | undefined;

  private _boundHandleClick: (e: MouseEvent) => void;
  private _boundHandleWheel: (e: WheelEvent) => void;

  constructor(options: YearSelectorOptions = {}) {
    this.container = document.getElementById(options.containerId || "yearBox");
    this.onYearChange = options.onYearChange;

    this._boundHandleClick = this._handleClick.bind(this);
    this._boundHandleWheel = this._handleWheel.bind(this);

    this._setupScrollWheel();
    this._setupEventDelegation();
  }

  public destroy(): void {
    if (this.container) {
      this.container.removeEventListener("click", this._boundHandleClick);
      this.container.removeEventListener("wheel", this._boundHandleWheel);
      this.container.innerHTML = "";
    }
    this.onYearChange = undefined;
  }

  /**
   * 接收所有可用年份（去重），如果未提供默认年份，则挑选最近的一年作为默认激活项
   * @param {string[]} years - 所有可用年份列表
   * @param {string} [defaultYear] - 默认激活年份
   */
  public init(years: string[], defaultYear?: string): void {
    if (!this.container) return;

    if (years.length === 0) return;
    this.currentYear = defaultYear || years[years.length - 1];

    this._renderYears(years);

    // 首次初始化后对外抛出选中年份的通信
    if (this.onYearChange) {
      this.onYearChange(this.currentYear);
    }
  }

  private _renderYears(years: string[]): void {
    if (!this.container) return;
    this.container.innerHTML = "";

    years.forEach((year) => {
      const yearEl = document.createElement("div");
      yearEl.className = `year-item ${year === this.currentYear ? "active" : ""}`;
      yearEl.innerText = year;
      yearEl.dataset.year = year;

      if (this.container) {
        this.container.appendChild(yearEl);
      }
    });
  }

  private _setupEventDelegation(): void {
    if (!this.container) return;
    this.container.addEventListener("click", this._boundHandleClick);
  }

  private _handleClick(e: MouseEvent): void {
    const target = e.target as HTMLElement;
    if (!target.classList.contains("year-item")) return;

    const year = target.dataset.year;
    if (!year || this.currentYear === year) return;

    this.currentYear = year;

    if (this.container) {
      this.container.querySelectorAll(".year-item").forEach((el) => {
        el.classList.remove("active");
      });
      target.classList.add("active");
    }

    if (this.onYearChange) {
      this.onYearChange(year);
    }
  }

  private _setupScrollWheel(): void {
    const box = this.container;
    if (!box) return;
    box.addEventListener("wheel", this._boundHandleWheel);
  }

  private _handleWheel(e: WheelEvent): void {
    const box = this.container;
    if (!box) return;
    if (e.deltaY !== 0) {
      e.preventDefault();
      box.scrollLeft += e.deltaY;
    }
  }
}
