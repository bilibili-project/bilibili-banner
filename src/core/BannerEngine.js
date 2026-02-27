/**
 * Bilibili Banner 交互引擎
 * 负责渲染图层、响应鼠标交互，并驱动视差/回正动画。
 */
export default class BannerEngine {
  /**
   * @param {string} containerSelector - Banner 容器的 CSS 选择器，例如 "#app"
   */
  constructor(containerSelector) {
    this.container = document.querySelector(containerSelector);
    this.allImagesData = [];
    this.layers = [];
    this.compensate = 1;
    this.simpleVideoMode = false;

    // 动画相关状态
    this.state = {
      initX: 0,
      moveX: 0,
      startTime: 0,
    };

    this.config = {
      duration: 300, // 回正动画时长 (ms)
    };

    this._init();
  }

  /**
   * 初始化：绑定事件处理器，确保回调内 this 指向正确
   * @private
   */
  _init() {
    if (!this.container) return;

    this.handleMouseEnter = this._handleMouseEnter.bind(this);
    this.handleMouseMove = this._handleMouseMove.bind(this);
    this.handleMouseLeave = this._handleMouseLeave.bind(this);
    this.handleResize = this._handleResize.bind(this);
    this._homing = this._homing.bind(this);
  }

  /**
   * 启动引擎：绑定全局事件
   */
  start() {
    this.container.addEventListener("mouseenter", this.handleMouseEnter);
    this.container.addEventListener("mousemove", this.handleMouseMove);
    this.container.addEventListener("mouseleave", this.handleMouseLeave);
    window.addEventListener("resize", this.handleResize);
    window.onblur = this.handleMouseLeave;
  }

  /**
   * 更新数据源并重新渲染
   * @param {Array<object>|object} newData - 图层数据数组（多图层模式）或含 mode:"simple-video" 的对象（单视频模式）
   */
  updateData(newData) {
    // 检测数据格式：对象且含 mode 字段 => 单视频模式，数组 => 传统多图层模式
    if (!Array.isArray(newData) && newData.mode === "simple-video") {
      this.simpleVideoMode = true;
      this.allImagesData = [];
      this.layers = [];
      this.container.innerHTML = "";
      this._renderSimpleVideo(newData);
      return;
    }

    this.simpleVideoMode = false;
    this.compensate = window.innerWidth > 1650 ? window.innerWidth / 1650 : 1;

    // 性能优化：预先计算好适配后的基础矩阵，避免在渲染和动画循环中重复计算
    this.allImagesData = newData.map((item) => {
      const baseTransform = [...item.transform];
      baseTransform[4] *= this.compensate;
      baseTransform[5] *= this.compensate;

      return {
        ...item,
        _baseMatrix: new DOMMatrix(baseTransform),
        _aCompensated: item.a,
        _gCompensated: item.g || 0,
      };
    });

    this.container.innerHTML = "";
    this.layers = [];
    this._render();
  }

  // ─────────────────────── 私有方法 ───────────────────────

  /**
   * 单视频模式渲染器：渲染一个固定尺寸的视频，居中显示，宽度不足时截断
   * @param {object} data - simple-video 格式的数据对象
   * @private
   */
  _renderSimpleVideo(data) {
    const wrapper = document.createElement("div");
    wrapper.className = "simple-video-container";

    const video = document.createElement("video");
    video.src = import.meta.env.BASE_URL + data.src.replace(/^\//, "");
    video.loop = true;
    video.autoplay = true;
    video.muted = true;
    video.playsInline = true;

    wrapper.appendChild(video);
    this.container.appendChild(wrapper);
  }

  /**
   * 线性插值
   * @param {number} start - 起始值
   * @param {number} end   - 目标值
   * @param {number} amt   - 插值进度 [0, 1]
   * @returns {number}
   * @private
   */
  _lerp(start, end, amt) {
    return (1 - amt) * start + amt * end;
  }

  /**
   * 核心渲染器：根据数据创建或更新所有图层 DOM 元素
   * @private
   */
  _render() {
    if (this.layers.length > 0) {
      // 窗口尺寸变化时的快速更新
      for (let i = 0; i < this.layers.length; i++) {
        const item = this.allImagesData[i];
        const child = this.layers[i].firstElementChild;
        child.style.width = `${item.width * this.compensate}px`;
        child.style.height = `${item.height * this.compensate}px`;
        this.layers[i].style.transform = item._baseMatrix;
      }
      return;
    }

    // 首次渲染
    const fragment = document.createDocumentFragment();
    for (let i = 0; i < this.allImagesData.length; i++) {
      const item = this.allImagesData[i];
      const layer = document.createElement("div");
      layer.className = "layer";
      layer.style.transform = item._baseMatrix;
      if (item.opacity) layer.style.opacity = item.opacity[0];

      const child = document.createElement(item.tagName || "img");
      if (item.tagName === "video") {
        child.loop = true;
        child.autoplay = true;
        child.muted = true;
      }
      child.src = import.meta.env.BASE_URL + item.src.replace(/^\//, "");
      if (item.blur) child.style.filter = `blur(${item.blur}px)`;
      child.style.width = `${item.width * this.compensate}px`;
      child.style.height = `${item.height * this.compensate}px`;

      layer.appendChild(child);
      fragment.appendChild(layer);
    }

    this.container.appendChild(fragment);
    this.layers = this.container.querySelectorAll(".layer");
  }

  /**
   * 物理动画：根据当前 moveX 或回正进度更新各图层变换
   * @param {number} [progress] - 回正动画进度 [0,1]；不传则为实时跟随鼠标模式
   * @private
   */
  _animate(progress) {
    if (this.layers.length <= 0) return;
    const isHoming = typeof progress === "number";
    const moveX = this.state.moveX;

    for (let i = 0; i < this.layers.length; i++) {
      const layer = this.layers[i];
      const item = this.allImagesData[i];

      const a = item._aCompensated;
      const baseM = item._baseMatrix;

      let move = moveX * a;
      let s = item.f ? item.f * moveX + 1 : 1;
      let g = moveX * item._gCompensated;

      // 使用原生矩阵操作，减少对象创建
      const m = baseM.translate(0, 0); // 克隆基础矩阵

      if (isHoming) {
        const currentMoveX = this._lerp(moveX, 0, progress);
        move = currentMoveX * a;
        s = item.f ? item.f * currentMoveX + 1 : 1;
        g = currentMoveX * item._gCompensated;
      }

      // matrix 计算优化
      const finalM = m.multiply(new DOMMatrix([s, 0, 0, s, move, g]));

      if (item.deg) {
        const currentDeg = isHoming
          ? this._lerp(item.deg * moveX, 0, progress)
          : item.deg * moveX;
        layer.style.transform = finalM.rotate(currentDeg * (180 / Math.PI));
      } else {
        layer.style.transform = finalM;
      }

      if (item.opacity) {
        layer.style.opacity =
          isHoming && moveX > 0
            ? this._lerp(item.opacity[1], item.opacity[0], progress)
            : this._lerp(
                item.opacity[0],
                item.opacity[1],
                (moveX / window.innerWidth) * 2,
              );
      }
    }
  }

  // ─────────────────────── 事件处理器 ───────────────────────

  /** @private */
  _handleMouseEnter(e) {
    if (this.simpleVideoMode) return;
    this.state.initX = e.pageX;
  }

  /** @private */
  _handleMouseMove(e) {
    if (this.simpleVideoMode) return;
    this.state.moveX = e.pageX - this.state.initX;
    requestAnimationFrame(() => this._animate());
  }

  /** @private */
  _handleMouseLeave() {
    if (this.simpleVideoMode) return;
    this.state.startTime = 0;
    requestAnimationFrame(this._homing);
  }

  /** @private */
  _handleResize() {
    if (this.simpleVideoMode) return;
    this._render();
  }

  /**
   * 回正动画帧循环（rAF 回调）
   * @param {DOMHighResTimeStamp} timestamp
   * @private
   */
  _homing(timestamp) {
    if (!this.state.startTime) this.state.startTime = timestamp;
    const elapsed = timestamp - this.state.startTime;
    const progress = Math.min(elapsed / this.config.duration, 1);

    this._animate(progress);
    if (progress < 1) requestAnimationFrame(this._homing);
  }
}
