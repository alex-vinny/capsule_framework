import type { FC } from 'react'
import DeviceScreen from './DeviceScreen'
import AppScreen from './AppScreen'
import CameraScreen from './CameraScreen'
import LocationScreen from './LocationScreen'
import HapticsScreen from './HapticsScreen'
import AlertsScreen from './AlertsScreen'
import ClipboardScreen from './ClipboardScreen'
import StorageScreen from './StorageScreen'
import FilesystemScreen from './FilesystemScreen'
import NetworkScreen from './NetworkScreen'
import PushScreen from './PushScreen'
import QuickJsScreen from './QuickJsScreen'
import JsRoutesScreen from './JsRoutesScreen'
import HttpRoutesScreen from './HttpRoutesScreen'

/**
 * One entry per playground screen. This is the single place to wire a feature:
 * add a `<Name>Screen.tsx` under features/ and one row here — Home renders the
 * grouped menu from this list and the router maps `id` → `Component`.
 * `deviceOnly` just shows a hint (these calls no-op or error in the browser).
 */
export interface Feature {
  id: string
  title: string
  icon: string
  group: string
  deviceOnly?: boolean
  Component: FC
}

export const FEATURES: Feature[] = [
  {
    id: 'camera',
    title: 'Camera',
    icon: '📷',
    group: 'Native APIs',
    deviceOnly: true,
    Component: CameraScreen,
  },
  {
    id: 'location',
    title: 'Location',
    icon: '📍',
    group: 'Native APIs',
    Component: LocationScreen,
  },
  { id: 'haptics', title: 'Haptics', icon: '📳', group: 'Native APIs', Component: HapticsScreen },
  { id: 'alerts', title: 'Alerts', icon: '💬', group: 'Native APIs', Component: AlertsScreen },
  {
    id: 'clipboard',
    title: 'Clipboard',
    icon: '📋',
    group: 'Native APIs',
    Component: ClipboardScreen,
  },
  { id: 'storage', title: 'Storage', icon: '💾', group: 'Native APIs', Component: StorageScreen },
  {
    id: 'filesystem',
    title: 'Filesystem',
    icon: '🗂️',
    group: 'Native APIs',
    Component: FilesystemScreen,
  },
  { id: 'app', title: 'App Lifecycle', icon: '🔄', group: 'Native APIs', Component: AppScreen },
  { id: 'network', title: 'Network', icon: '📶', group: 'Native APIs', Component: NetworkScreen },
  { id: 'push', title: 'Push', icon: '🔔', group: 'Native APIs', Component: PushScreen },
  { id: 'device', title: 'Device Info', icon: '⚙️', group: 'Device', Component: DeviceScreen },
  {
    id: 'quickjs',
    title: 'QuickJS Engine',
    icon: '⚡',
    group: 'Engine',
    deviceOnly: true,
    Component: QuickJsScreen,
  },
  {
    id: 'js-routes',
    title: 'JS Routes',
    icon: '🧩',
    group: 'Engine',
    deviceOnly: true,
    Component: JsRoutesScreen,
  },
  {
    id: 'http-routes',
    title: 'HTTP Routes',
    icon: '🛣️',
    group: 'Engine',
    deviceOnly: true,
    Component: HttpRoutesScreen,
  },
]
