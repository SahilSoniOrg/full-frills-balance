export async function loadWidgetModule() {
  const { default: expoWidgetsModule } = await import('@/modules/expo-widgets');
  return expoWidgetsModule;
}
