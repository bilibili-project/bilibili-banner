import "./styles/index.css";
import BannerDataLoader from "./core/BannerDataLoader";
import BannerEngine from "./core/BannerEngine";
import BannerTimeLine from "./ui/BannerTimeLine";
import YearSelector from "./ui/YearSelector";

const loader = new BannerDataLoader();
const engine = new BannerEngine("#app");

const PERSIST_KEY = "last_banner_path";

engine.start();

loader
  .load()
  .then((data) => {
    // 1. 获取持久化状态
    const savedPath = localStorage.getItem(PERSIST_KEY) || "";
    let initialYear = "";
    if (savedPath) {
      // 尝试寻找该路径对应的年份
      const matched = data.find((item) =>
        item.variants.some((v) => v.path === savedPath),
      );
      if (matched) initialYear = matched.date.split("-")[0];
    }

    const bannerTimeLine = new BannerTimeLine({
      containerId: "selectBox",
      onVariantSelect: (variant) => {
        engine.updateData(variant.data);
        localStorage.setItem(PERSIST_KEY, variant.path);
      },
    });

    const yearSelector = new YearSelector({
      containerId: "yearBox",
      onYearChange: (year) => {
        const filteredData = data.filter((item) => item.date.startsWith(year));
        // 实时获取最新的持久化路径，确保组件联动逻辑正确
        const currentSavedPath = localStorage.getItem(PERSIST_KEY) || "";
        const targetPathForYear = currentSavedPath.startsWith(year)
          ? currentSavedPath
          : undefined;
        bannerTimeLine.render(filteredData, targetPathForYear);
      },
    });

    const years = [...new Set(data.map((item) => item.date.split("-")[0]))];
    // 如果没有找到对应的年份，则默认使用最后一年
    yearSelector.init(years, initialYear || years[years.length - 1]);
  })
  .catch((e) => console.error("Banner metadata loading failed", e));
