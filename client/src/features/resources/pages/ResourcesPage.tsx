const REPO_URL = 'https://github.com/FB208/OpenBidKit_Yibiao';

function ResourcesPage() {
  const openRepo = () => {
    void window.yibiao?.openExternal(REPO_URL);
  };

  return (
    <div className="resources-page">
      <section className="resources-shelf-panel" aria-label="致谢">
        <div className="resources-shelf-head">
          <div>
            <span className="section-kicker">致谢</span>
            <h3>感谢开源</h3>
          </div>
        </div>

        <div className="resources-shelf-list">
          <div className="resources-empty-state">
            <strong>感谢原作者的开源分享</strong>
            <span>本工具基于开源项目 OpenBidKit 二次开发，在此向原作者致以诚挚的谢意。</span>
            <button type="button" className="primary-action" onClick={openRepo} style={{ marginTop: 12 }}>
              访问原项目：github.com/FB208/OpenBidKit_Yibiao
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}

export default ResourcesPage;
