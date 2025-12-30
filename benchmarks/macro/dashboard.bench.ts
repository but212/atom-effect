/**
 * @fileoverview Dashboard simulation benchmark
 */

import { runBenchmark } from '../utils/benchmark-runner';
import { atom, batch, computed, effect } from '../utils/import-lib';
import { MemoryTracker } from '../utils/memory-tracker';

interface DataPoint {
  timestamp: number;
  value: number;
}

interface Widget {
  id: string;
  data: DataPoint[];
}

/**
 * create dashboard
 */
function createDashboard(widgetCount: number, dataPointsPerWidget: number) {
  // widget data
  const widgets = atom<Widget[]>(
    Array.from({ length: widgetCount }, (_, i) => ({
      id: `widget-${i}`,
      data: Array.from({ length: dataPointsPerWidget }, (_, j) => ({
        timestamp: Date.now() - (dataPointsPerWidget - j) * 1000,
        value: Math.random() * 100,
      })),
    }))
  );

  // selected widget
  const selectedWidgetId = atom<string | null>(null);
  const selectedWidget = computed(() => {
    const id = selectedWidgetId.value;
    if (!id) return null;
    return widgets.value.find((w: Widget) => w.id === id) || null;
  });

  // total data points
  const totalDataPoints = computed(() => widgets.value.reduce((sum: number, w: Widget) => sum + w.data.length, 0));

  const averageValue = computed(() => {
    const allValues = widgets.value.flatMap((w: Widget) => w.data.map((d: DataPoint) => d.value));
    if (allValues.length === 0) return 0;
    return allValues.reduce((sum: number, v: number) => sum + v, 0) / allValues.length;
  });

  const maxValue = computed(() => {
    const allValues = widgets.value.flatMap((w: Widget) => w.data.map((d: DataPoint) => d.value));
    if (allValues.length === 0) return 0;
    return Math.max(...allValues);
  });

  const minValue = computed(() => {
    const allValues = widgets.value.flatMap((w: Widget) => w.data.map((d: DataPoint) => d.value));
    if (allValues.length === 0) return 0;
    return Math.min(...allValues);
  });

  // widget stats
  const widgetStats = computed(() =>
    widgets.value.map((widget: Widget) => {
      const values = widget.data.map((d: DataPoint) => d.value);
      const sum = values.reduce((a: number, b: number) => a + b, 0);
      const avg = sum / values.length;
      const max = Math.max(...values);
      const min = Math.min(...values);

      return {
        id: widget.id,
        count: values.length,
        sum,
        avg,
        max,
        min,
      };
    })
  );

  // update widget
  const updateWidget = (widgetId: string, newValue: number) => {
    widgets.value = widgets.value.map((w: Widget) => {
      if (w.id !== widgetId) return w;
      return {
        ...w,
        data: [...w.data.slice(1), { timestamp: Date.now(), value: newValue }],
      };
    });
  };

  const updateAllWidgets = (values: number[]) => {
    batch(() => {
      widgets.value = widgets.value.map((w: Widget, i: number) => ({
        ...w,
        data: [
          ...w.data.slice(1),
          { timestamp: Date.now(), value: values[i] || Math.random() * 100 },
        ],
      }));
    });
  };

  return {
    widgets,
    selectedWidgetId,
    selectedWidget,
    totalDataPoints,
    averageValue,
    maxValue,
    minValue,
    widgetStats,
    updateWidget,
    updateAllWidgets,
  };
}

function disposeDashboard(d: ReturnType<typeof createDashboard>): void {
  d.widgetStats.dispose();
  d.minValue.dispose();
  d.maxValue.dispose();
  d.averageValue.dispose();
  d.totalDataPoints.dispose();
  d.selectedWidget.dispose();
}

export async function runDashboardBenchmark() {
  const tracker = new MemoryTracker();

  tracker.snapshot();

  const results = await runBenchmark(
    'Dashboard Simulation',
    {
      'create dashboard (10 widgets, 100 points each)': () => {
        const d = createDashboard(10, 100);
        disposeDashboard(d);
      },

      'create dashboard (50 widgets, 100 points each)': () => {
        const d = createDashboard(30, 100);
        disposeDashboard(d);
      },

      'calculate statistics': () => {
        const dashboard = createDashboard(30, 100);
        dashboard.averageValue.value;
        dashboard.maxValue.value;
        dashboard.minValue.value;
        dashboard.totalDataPoints.value;
        disposeDashboard(dashboard);
      },

      'widget statistics': () => {
        const dashboard = createDashboard(30, 100);
        dashboard.widgetStats.value;
        disposeDashboard(dashboard);
      },

      'update single widget': () => {
        const dashboard = createDashboard(30, 100);
        dashboard.updateWidget('widget-0', 75);
        dashboard.averageValue.value;
        disposeDashboard(dashboard);
      },

      'update 10 widgets (one by one)': () => {
        const dashboard = createDashboard(30, 100);
        for (let i = 0; i < 10; i++) {
          dashboard.updateWidget(`widget-${i}`, Math.random() * 100);
        }
        dashboard.averageValue.value;
        disposeDashboard(dashboard);
      },

      'update all widgets (batched)': () => {
        const dashboard = createDashboard(30, 100);
        const values = Array.from({ length: 30 }, () => Math.random() * 100);
        dashboard.updateAllWidgets(values);
        dashboard.averageValue.value;
        disposeDashboard(dashboard);
      },

      'simulate real-time updates (100 updates)': () => {
        const dashboard = createDashboard(30, 100);
        for (let i = 0; i < 100; i++) {
          const widgetId = `widget-${i % 30}`;
          dashboard.updateWidget(widgetId, Math.random() * 100);
        }
        dashboard.widgetStats.value;
        disposeDashboard(dashboard);
      },

      'select and view widget': () => {
        const dashboard = createDashboard(30, 100);
        dashboard.selectedWidgetId.value = 'widget-10';
        dashboard.selectedWidget.value;
        disposeDashboard(dashboard);
      },

      'switch between widgets (10 times)': () => {
        const dashboard = createDashboard(30, 100);
        for (let i = 0; i < 10; i++) {
          dashboard.selectedWidgetId.value = `widget-${i}`;
          dashboard.selectedWidget.value;
        }
        disposeDashboard(dashboard);
      },

      'dashboard with effects': () => {
        const dashboard = createDashboard(20, 50);
        const logs: string[] = [];

        const e1 = effect(() => {
          const avg = dashboard.averageValue.value;
          logs.push(`Average: ${avg}`);
        });

        const e2 = effect(() => {
          const selected = dashboard.selectedWidget.value;
          if (selected) {
            logs.push(`Selected: ${selected.id}`);
          }
        });

        dashboard.updateWidget('widget-0', 100);
        dashboard.selectedWidgetId.value = 'widget-5';

        e2.dispose();
        e1.dispose();
        disposeDashboard(dashboard);
      },

      'complex dashboard workflow': () => {
        const dashboard = createDashboard(30, 100);

        // initial stats
        dashboard.widgetStats.value;

        // update widgets
        batch(() => {
          for (let i = 0; i < 10; i++) {
            dashboard.updateWidget(`widget-${i}`, Math.random() * 100);
          }
        });

        // recalculate stats
        dashboard.averageValue.value;
        dashboard.maxValue.value;

        // select and view widget
        for (let i = 0; i < 5; i++) {
          dashboard.selectedWidgetId.value = `widget-${i}`;
          dashboard.selectedWidget.value;
        }

        // update all widgets
        const values = Array.from({ length: 30 }, () => Math.random() * 100);
        dashboard.updateAllWidgets(values);
        dashboard.widgetStats.value;
        disposeDashboard(dashboard);
      },
    },
    { time: 20, iterations: 10, maxSamples: 2000 }
  );

  tracker.snapshot();
  const memoryDiff = tracker.lastDiff();
  if (memoryDiff) {
    tracker.printDiff(memoryDiff);
  }

  return { results, memory: memoryDiff };
}

// directly run benchmark
// if (import.meta.url === `file://${process.argv[1]}`) {
//   runDashboardBenchmark().catch(console.error);
// }
