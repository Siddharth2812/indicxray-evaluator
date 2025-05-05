import React, { useState } from 'react'
import {
  ZoomIn,
  ZoomOut,
  Maximize,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Dialog, DialogContent, DialogTrigger } from '@/components/ui/dialog'

interface ImageViewerProps {
  currentIndex: number
  onChangeImage: (index: number) => void
  totalImages?: number
}

export const ImageViewer: React.FC<ImageViewerProps> = ({
  currentIndex,
  onChangeImage,
  totalImages = 1,
}) => {
  const [zoomLevel, setZoomLevel] = useState(1)
  const [imageError, setImageError] = useState<string | null>(null)

  const handleZoomIn = () => {
    setZoomLevel((prev) => Math.min(prev + 0.25, 3))
  }

  const handleZoomOut = () => {
    setZoomLevel((prev) => Math.max(prev - 0.25, 0.5))
  }

  const handleImageError = () => {
    setImageError('Failed to load image')
  }

  const handleImageLoad = () => {
    setImageError(null)
  }

  return (
    <div className="flex flex-col h-full bg-medical-darkest-gray rounded-lg overflow-hidden border border-medical-dark-gray/30">
      <div className="p-3 border-b border-medical-dark-gray/30 flex justify-between items-center">
        <h2 className="text-lg font-medium">Chest X-Ray</h2>
        <div className="flex items-center space-x-1">
          <button
            onClick={handleZoomOut}
            className="p-1.5 rounded-md nav-button"
            aria-label="Zoom out"
          >
            <ZoomOut size={18} />
          </button>
          <button
            onClick={handleZoomIn}
            className="p-1.5 rounded-md nav-button"
            aria-label="Zoom in"
          >
            <ZoomIn size={18} />
          </button>

          <Dialog>
            <DialogTrigger asChild>
              <button
                className="p-1.5 rounded-md nav-button"
                aria-label="View full image"
              >
                <Maximize size={18} />
              </button>
            </DialogTrigger>
            <DialogContent className="max-w-4xl w-full p-0 bg-medical-darkest-gray">
              <div className="p-4 flex items-center justify-center">
                <img
                  src="/metric_score.jpeg"
                  alt="Full size X-ray"
                  className="max-h-[80vh] object-contain"
                  onError={handleImageError}
                  onLoad={handleImageLoad}
                />
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="flex-1 flex items-center justify-center overflow-hidden relative">
        {imageError ? (
          <div className="text-medical-red text-center p-4">
            <p>{imageError}</p>
            <p className="text-sm text-medical-gray mt-2">Unable to load image</p>
          </div>
        ) : (
          <div
            className="transition-transform duration-300 ease-out"
            style={{ transform: `scale(${zoomLevel})` }}
          >
            <img
              src="/metric_score.jpeg"
              alt="X-ray image"
              className="max-w-full max-h-full object-contain"
              onError={handleImageError}
              onLoad={handleImageLoad}
            />
          </div>
        )}
      </div>
    </div>
  )
}
