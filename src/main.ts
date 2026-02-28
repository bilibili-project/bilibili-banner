import "./styles/index.css";
import BannerDataLoader from "./core/BannerDataLoader";
import BannerEngine from "./core/BannerEngine";
import BannerTimeLine from "./ui/BannerTimeLine";
import YearSelector from "./ui/YearSelector";

const loader = new BannerDataLoader();
const engine = new BannerEngine("#app");

engine.start();

loader
  .load()
  .then((data) => {
    const bannerTimeLine = new BannerTimeLine({
      containerId: "selectBox",
      onVariantSelect: (variantData) => {
        engine.updateData(variantData);
      },
    });
    const yearSelector = new YearSelector({
      containerId: "yearBox",
      onYearChange: (year) => {
        // 组件胶水逻辑：年份改变时，过滤该年份数据并让变体列表渲染
        const filteredData = data.filter((item) => item.date.startsWith(year));
        bannerTimeLine.render(filteredData);
      },
    });

    // 提取所有唯一年份并向年份选择器全量灌注，触发初始化回调瀑布
    const years = [...new Set(data.map((item) => item.date.split("-")[0]))];
    yearSelector.init(years);
  })
  .catch((e) => console.error("Banner metadata loading failed", e));
