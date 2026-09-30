/** Native widget bridge kept inside the owning widget service boundary. */
export async function loadNativeWidgetAdapter() {
  const { default: module } = await import('@/modules/expo-widgets');
  return module;
}
