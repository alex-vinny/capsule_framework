import { describe, it, expect, beforeEach } from 'vitest'
import { CameraModule, type CameraPhoto } from '../camera.js'
import { FakeBridge } from '../testing/fake-bridge.js'
import { CapsuleError } from '../errors.js'

const mockPhoto: CameraPhoto = {
  webPath: 'data:image/jpeg;base64,AAAA',
  format: 'jpeg',
  width: 1280,
  height: 960,
  size: 3,
}

describe('CameraModule', () => {
  let bridge: FakeBridge
  let camera: CameraModule

  beforeEach(() => {
    bridge = new FakeBridge()
    camera = new CameraModule(bridge)
  })

  it('capturePhoto calls the correct method and returns the photo', async () => {
    bridge.mockResolve('camera.capturePhoto', mockPhoto)

    const photo = await camera.capturePhoto()

    expect(photo).toEqual(mockPhoto)
    expect(bridge.calls[0]).toEqual({ method: 'camera.capturePhoto', params: {} })
  })

  it('passes capture options through', async () => {
    bridge.mockResolve('camera.capturePhoto', mockPhoto)

    await camera.capturePhoto({ quality: 0.7, facing: 'front', maxWidth: 1024, result: 'dataUrl' })

    expect(bridge.calls[0].params).toEqual({
      quality: 0.7,
      facing: 'front',
      maxWidth: 1024,
      result: 'dataUrl',
    })
  })

  it('pickImage calls the correct method and returns the photo', async () => {
    bridge.mockResolve('camera.pickImage', mockPhoto)

    const photo = await camera.pickImage()

    expect(photo).toEqual(mockPhoto)
    expect(bridge.calls[0]).toEqual({ method: 'camera.pickImage', params: {} })
  })

  it('passes pick options through', async () => {
    bridge.mockResolve('camera.pickImage', mockPhoto)

    await camera.pickImage({ maxHeight: 800 })

    expect(bridge.calls[0].params).toEqual({ maxHeight: 800 })
  })

  it('propagates permission denied error', async () => {
    bridge.mockReject('camera.capturePhoto', new CapsuleError(2001, 'PERMISSION_DENIED'))
    await expect(camera.capturePhoto()).rejects.toThrow('PERMISSION_DENIED')
  })

  it('propagates cancellation error', async () => {
    bridge.mockReject('camera.pickImage', new CapsuleError(2002, 'OPERATION_CANCELLED'))
    await expect(camera.pickImage()).rejects.toThrow('OPERATION_CANCELLED')
  })

  it('propagates camera unavailable error', async () => {
    bridge.mockReject('camera.capturePhoto', new CapsuleError(4001, 'CAMERA_UNAVAILABLE'))
    await expect(camera.capturePhoto()).rejects.toThrow('CAMERA_UNAVAILABLE')
  })
})
