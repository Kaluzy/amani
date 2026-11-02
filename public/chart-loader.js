let loading;
export async function ensureCharts(signal) {
  if (!window.Chart) {
    loading ||= new Promise(resolve => {
      const script = document.createElement('script');
      const url = new URL('./vendor/chart.js', import.meta.url);
      url.search = new URL(import.meta.url).search;
      script.src = url.href; script.async = true;
      const timer = setTimeout(() => { script.remove(); loading = null; resolve(); }, 10000);
      script.onload = () => { clearTimeout(timer); resolve(); };
      script.onerror = () => { clearTimeout(timer); script.remove(); loading = null; resolve(); };
      document.head.append(script);
    });
    await loading;
  }
  signal?.throwIfAborted();
}
