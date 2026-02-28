import type { LoadedBannerData, LoadedVariant } from "../core/BannerDataLoader";
import type { StandardBannerData } from "../core/BannerEngine";

export interface BannerTimeLineOptions {
  containerId?: string;
  onVariantSelect?: (data: StandardBannerData) => void;
}

export default class BannerTimeLine {
  private container: HTMLElement | null;
  private _bodyDropdowns: HTMLDivElement[] = [];
  private onVariantSelect?: (data: StandardBannerData) => void;
  private _itemDataMap: WeakMap<HTMLElement, LoadedBannerData> = new WeakMap();
  private _activeDropdownTimer?: number;

  private _boundHandleClick: (e: MouseEvent) => void;
  private _boundHandleMouseOver: (e: MouseEvent) => void;
  private _boundHandleMouseOut: (e: MouseEvent) => void;
  private _boundHandleWheel: (e: WheelEvent) => void;

  constructor(options: BannerTimeLineOptions = {}) {
    this.container = document.getElementById(
      options.containerId || "selectBox",
    );
    this.onVariantSelect = options.onVariantSelect;

    this._boundHandleClick = this._handleClick.bind(this);
    this._boundHandleMouseOver = this._handleMouseOver.bind(this);
    this._boundHandleMouseOut = this._handleMouseOut.bind(this);
    this._boundHandleWheel = this._handleWheel.bind(this);

    this._setupScrollWheel();
    this._setupEventDelegation();
  }

  public destroy(): void {
    this._cleanupDropdowns();
    if (this.container) {
      this.container.removeEventListener("click", this._boundHandleClick);
      this.container.removeEventListener(
        "mouseover",
        this._boundHandleMouseOver,
      );
      this.container.removeEventListener("mouseout", this._boundHandleMouseOut);
      this.container.removeEventListener("wheel", this._boundHandleWheel);
      this.container.innerHTML = "";
    }
    this._itemDataMap = new WeakMap();
    this.onVariantSelect = undefined;
  }

  /**
   * 接收过滤好的特定年份的变体数据进行渲染
   * @param {LoadedBannerData[]} filteredData
   */
  public render(filteredData: LoadedBannerData[]): void {
    if (!this.container) return;

    this._cleanupDropdowns();
    this.container.innerHTML = "";

    filteredData.forEach((item, index) => {
      const isLatest = index === filteredData.length - 1;
      const itemEl = this._createTimelineItem(item, isLatest);
      this.container?.appendChild(itemEl);

      // 初次渲染或者按年切换时，选中最后一项并居中
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
      if (this.onVariantSelect) {
        this.onVariantSelect(latestItem.variants[0].data);
      }
    }
  }

  private _cleanupDropdowns(): void {
    window.clearTimeout(this._activeDropdownTimer);
    this._bodyDropdowns.forEach((d) => {
      // Remove portal events
      d.removeEventListener("mouseenter", this._clearTimerBound);
      d.removeEventListener("mouseleave", this._hideDropdownScheduledBound);
      d.remove();
    });
    this._bodyDropdowns = [];
    this._itemDataMap = new WeakMap();
  }

  private _clearTimerBound = () =>
    window.clearTimeout(this._activeDropdownTimer);
  private _hideDropdownScheduledBound = () => this._hideDropdownScheduled();

  private _createTimelineItem(
    item: LoadedBannerData,
    isActive: boolean,
  ): HTMLDivElement {
    const itemEl = document.createElement("div");
    itemEl.className = `timeline-item ${isActive ? "active" : ""}`;

    const content = document.createElement("div");
    content.className = "item-content";

    const dateStr = document.createElement("span");
    dateStr.className = "item-date";
    dateStr.innerText = item.date;

    const name = document.createElement("span");
    name.className = "item-name";

    const nameText = document.createElement("span");
    nameText.innerText = item.variants[0].name;
    name.appendChild(nameText);

    content.appendChild(dateStr);
    content.appendChild(name);
    itemEl.appendChild(content);

    if (item.variants.length > 1) {
      itemEl.classList.add("has-variants");

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

      const dropdownId = `dropdown-${Math.random().toString(36).substr(2, 9)}`;
      itemEl.dataset.dropdownId = dropdownId;
      const dropdown = document.createElement("div");
      dropdown.id = dropdownId;
      dropdown.className = "variant-dropdown";

      item.variants.forEach((variant: LoadedVariant, index: number) => {
        const btn = document.createElement("div");
        btn.className = `variant-item ${index === 0 && isActive ? "active" : ""}`;
        btn.innerText = variant.name;

        btn.addEventListener("click", (e: MouseEvent) => {
          e.stopPropagation();

          if (this.container) {
            this.container.querySelectorAll(".timeline-item").forEach((el) => {
              el.classList.remove("active");
            });
          }
          itemEl.classList.add("active");

          dropdown.querySelectorAll(".variant-item").forEach((el) => {
            el.classList.remove("active");
          });
          btn.classList.add("active");

          nameText.innerText = variant.name;
          if (this.onVariantSelect) {
            this.onVariantSelect(variant.data);
          }
        });

        dropdown.appendChild(btn);
      });

      document.body.appendChild(dropdown);
      this._bodyDropdowns.push(dropdown);

      // Portal hover events (Cannot delegate outside container easily, so bind directly to portal)
      dropdown.addEventListener("mouseenter", this._clearTimerBound);
      dropdown.addEventListener("mouseleave", this._hideDropdownScheduledBound);
    }

    itemEl.dataset.index = isActive ? "active" : "";
    this._itemDataMap.set(itemEl, item);
    return itemEl;
  }

  private _setupEventDelegation(): void {
    if (!this.container) return;

    // Click Delegation
    this.container.addEventListener("click", this._boundHandleClick);

    // Hover Delegation (mouseover/mouseout bubble)
    this.container.addEventListener("mouseover", this._boundHandleMouseOver);
    this.container.addEventListener("mouseout", this._boundHandleMouseOut);
  }

  private _handleClick(e: MouseEvent): void {
    const target = e.target as HTMLElement;
    const itemEl = target.closest(".timeline-item") as HTMLElement;
    if (!itemEl) return;

    const itemData = this._itemDataMap.get(itemEl);
    if (!itemData) return;

    if (this.container) {
      this.container.querySelectorAll(".timeline-item").forEach((el) => {
        el.classList.remove("active");
      });
    }
    itemEl.classList.add("active");

    const nameText = itemEl.querySelector("span > span") as HTMLElement;
    if (nameText) nameText.innerText = itemData.variants[0].name;

    if (this.onVariantSelect) {
      this.onVariantSelect(itemData.variants[0].data as StandardBannerData);
    }
  }

  private _handleMouseOver(e: MouseEvent): void {
    const target = e.target as HTMLElement;
    const itemEl = target.closest(".timeline-item.has-variants") as HTMLElement;

    if (itemEl && !itemEl.contains(e.relatedTarget as Node)) {
      this._showDropdownFor(itemEl);
    }
  }

  private _handleMouseOut(e: MouseEvent): void {
    const target = e.target as HTMLElement;
    const itemEl = target.closest(".timeline-item.has-variants") as HTMLElement;

    if (itemEl && !itemEl.contains(e.relatedTarget as Node)) {
      this._hideDropdownScheduled();
    }
  }

  private _showDropdownFor(itemEl: HTMLElement): void {
    window.clearTimeout(this._activeDropdownTimer);

    // Hide all first
    this._bodyDropdowns.forEach((d) => {
      d.classList.remove("visible");
    });

    const dropdownId = itemEl.dataset.dropdownId;
    if (!dropdownId) return;

    const dropdown = document.getElementById(dropdownId) as HTMLDivElement;
    if (!dropdown) return;

    const rect = itemEl.getBoundingClientRect();
    dropdown.style.top = `${rect.bottom + 8}px`;
    dropdown.style.left = `${rect.left + rect.width / 2}px`;
    dropdown.classList.add("visible");
  }

  private _hideDropdownScheduled(): void {
    window.clearTimeout(this._activeDropdownTimer);
    this._activeDropdownTimer = window.setTimeout(() => {
      this._bodyDropdowns.forEach((d) => {
        d.classList.remove("visible");
      });
    }, 150);
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
