// src/context/image-gen-context.tsx
"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";
import { useApiKeys } from "@/context/api-keys-context";
import { useAssetUpload } from "@/context/asset-context";
import { useChatWebSocketContext } from "@/context/chat-ws-context";
import { useModelSelection } from "@/context/model-selection-context";
import { usePathnameContext } from "@/context/pathname-context";
import type {
  AIChatRequestImgGenFields,
  AllImgGenFacilitatingModelsUnion,
  EventTypeMap,
  ImageGenModels,
  ImageGenProviders,
  ImageGenRequest,
  ImgGenStage
} from "@slipstream/types";
import { ProviderValidation } from "@slipstream/img-gen";

interface GeneratedImage {
  cdnUrl: string;
  width: number;
  height: number;
  mime: string;
  revisedPrompt?: string;
  isPartial?: boolean;
  index?: number;
}

interface GenerationTask {
  id: string;
  conversationId: string;
  prompt: string;
  model: string;
  provider: string;
  requestedCount: number;
  actualCount: number;
  progress: number;
  stage: ImgGenStage;
  partialImages: GeneratedImage[];
  finalImages: GeneratedImage[];
  error?: string;
  startedAt: number;
  completedAt?: number;
  duration?: number;
}

interface ImageGenContextValue {
  // Core state
  activeConversationId: string | null;
  currentGeneration: GenerationTask | null;
  isGenerating: boolean;
  generationProgress: number;
  error: string | null;

  // Image states
  partialImages: GeneratedImage[];
  finalImages: GeneratedImage[];
  latestPartialImage: GeneratedImage | null; // For UI to show most recent

  // Actions
  generateImages: (
    prompt: string,
    imgGenFields?: AIChatRequestImgGenFields,
    conversationId?: string
  ) => void;
  clearError: () => void;
  resetGeneration: () => void;

  // Status
  isConnected: boolean;
}

const ImageGenContext = createContext<ImageGenContextValue | undefined>(
  undefined
);

export function ImageGenProvider({
  children,
  userId
}: {
  children: React.ReactNode;
  userId?: string;
}) {
  const imgValidator = useMemo(() => new ProviderValidation(), []);
  const { conversationId: pathConvId } = usePathnameContext();
  const { client, sendEvent, isConnected } = useChatWebSocketContext();
  const { selectedModel } = useModelSelection();
  const { apiKeys } = useApiKeys();
  const { currentBatchId } = useAssetUpload();
  const [activeConversationId, setActiveConversationId] = useState<
    string | null
  >(pathConvId ?? "new-chat");

  const [currentGeneration, setCurrentGeneration] =
    useState<GenerationTask | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationProgress, setGenerationProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  // Image states
  const [partialImages, setPartialImages] = useState<GeneratedImage[]>([]);
  const [finalImages, setFinalImages] = useState<GeneratedImage[]>([]);
  const [outputQuality, _setOutputQuality] = useState<string | undefined>(
    undefined
  );
  const [latestPartialImage, setLatestPartialImage] =
    useState<GeneratedImage | null>(null);

  // Track active generation to prevent duplicates
  const activeGenerationRef = useRef<string | null>(null);

  // Sync conversation ID with pathname
  useEffect(() => {
    if (pathConvId && pathConvId !== activeConversationId) {
      // eslint-disable-next-line
      setActiveConversationId(pathConvId);
    }
  }, [pathConvId, activeConversationId]);

  const clearError = useCallback(() => setError(null), []);

  const resetGeneration = useCallback(() => {
    setCurrentGeneration(null);
    setIsGenerating(false);
    setGenerationProgress(0);
    setError(null);
    setPartialImages([]);
    setFinalImages([]);
    setLatestPartialImage(null);
    activeGenerationRef.current = null;
  }, []);
  const hasProviderConfigured = apiKeys.isSet[selectedModel.provider];
  const prov = selectedModel.provider as ImageGenProviders;
  const mod = selectedModel.modelId as
    | ImageGenModels
    | AllImgGenFacilitatingModelsUnion;
  const generateImages = useCallback(
    (
      prompt: string,
      imgGenFields?: AIChatRequestImgGenFields,
      conversationId?: string
    ) => {
      if (!userId) {
        console.warn("[ImageGenContext] Cannot generate without userId");
        return;
      }

      // Prevent duplicate generations
      if (activeGenerationRef.current) {
        console.warn("[ImageGenContext] Generation already in progress");
        return;
      }

      const convId = conversationId ?? activeConversationId ?? "new-chat";
      const genId = `gen_${Date.now()}`;
      activeGenerationRef.current = genId;

      // Initialize generation task
      const task = {
        id: genId,
        conversationId: convId,
        prompt,
        model: mod,
        duration: 0,
        completedAt: undefined,
        provider: prov,
        requestedCount: imgGenFields?.n ?? 1,
        actualCount: 0,
        progress: 0,
        stage: "queued",
        partialImages: [],
        finalImages: [],
        startedAt: Date.now()
      } satisfies GenerationTask;

      setCurrentGeneration(task);
      setIsGenerating(true);
      setGenerationProgress(0);
      setError(null);
      setPartialImages([]);
      setFinalImages([]);
      setLatestPartialImage(null);

      // Send generation request
      sendEvent("image_gen_request", {
        output_quality:
          imgValidator.handleImgGenOutputQuality(
            selectedModel.provider as ImageGenProviders,
            selectedModel.modelId as
              | ImageGenModels
              | AllImgGenFacilitatingModelsUnion,
            { output_quality: outputQuality }
          ) ?? "",
        hasProviderConfigured,
        batchId: currentBatchId ?? undefined,
        type: "image_gen_request",
        conversationId: convId,
        prompt,
        provider: selectedModel.provider as ImageGenProviders,
        model: selectedModel.modelId as ImageGenModels
      } satisfies ImageGenRequest);
    },
    [
      userId,
      imgValidator,
      activeConversationId,
      hasProviderConfigured,
      mod,
      currentBatchId,
      outputQuality,
      selectedModel,
      prov,
      sendEvent
    ]
  );

  // WebSocket event handlers
  useEffect(() => {
    const handleProgress = (evt: EventTypeMap["image_gen_progress"]) => {
      if (!currentGeneration || !activeGenerationRef.current) return;

      // Update progress and stage
      setGenerationProgress(evt.progress);
      setCurrentGeneration(prev =>
        prev
          ? { ...prev, progress: evt.progress, stage: evt.stage ?? prev.stage }
          : null
      );

      // Handle partial images - these are CDN URLs ready for display
      if (evt.partial_image && evt.partial_image.length > 0) {
        const newPartials = evt.partial_image.map((img, idx) => ({
          ...img,
          isPartial: true,
          index: idx
        }));

        setPartialImages(prev => [...prev, ...newPartials]);
        const nP = newPartials[newPartials.length - 1];
        if (typeof nP !== "undefined") {
          setLatestPartialImage(nP);
        }
        console.log(
          `[ImageGenContext] Received ${newPartials.length} partial images`
        );
      }

      // Handle any final images in progress events (edge case)
      if (evt.images && evt.images.length > 0) {
        const newFinals = evt.images.map((img, idx) => ({
          ...img,
          isPartial: false,
          index: idx
        }));
        setFinalImages(prev => [...prev, ...newFinals]);
      }
    };

    const handleResponse = (evt: EventTypeMap["image_gen_response"]) => {
      if (!currentGeneration || !activeGenerationRef.current) return;

      console.log(
        `[ImageGenContext] Generation complete with ${evt.images.length} images`
      );

      // Store final images (these are CDN URLs)
      const finals = evt.images.map((img, idx) => ({
        ...img,
        isPartial: false,
        index: idx
      }));

      setFinalImages(finals);
      setLatestPartialImage(null); // Clear partial since we have finals

      // Update task
      setCurrentGeneration(prev =>
        prev
          ? {
              ...prev,
              actualCount: evt.actual_count,
              finalImages: finals,
              completedAt: Date.now(),
              duration: evt.duration,
              stage: "finalizing" as const
            }
          : null
      );

      // Cleanup
      setIsGenerating(false);
      setGenerationProgress(100);
      activeGenerationRef.current = null;
    };

    const handleError = (evt: EventTypeMap["image_gen_error"]) => {
      console.error(`[ImageGenContext] Generation error: ${evt.error}`);

      setError(evt.error);
      setIsGenerating(false);
      setGenerationProgress(0);
      setLatestPartialImage(null);

      if (currentGeneration) {
        setCurrentGeneration(prev =>
          prev ? { ...prev, error: evt.error, completedAt: Date.now() } : null
        );
      }

      activeGenerationRef.current = null;
    };

    // Subscribe to events
    client.on("image_gen_progress", handleProgress);
    client.on("image_gen_response", handleResponse);
    client.on("image_gen_error", handleError);

    return () => {
      client.off("image_gen_progress");
      client.off("image_gen_response");
      client.off("image_gen_error");
    };
  }, [client, currentGeneration]);

  const value = useMemo<ImageGenContextValue>(
    () => ({
      activeConversationId,
      currentGeneration,
      isGenerating,
      generationProgress,
      error,
      partialImages,
      finalImages,
      latestPartialImage,
      generateImages,
      clearError,
      resetGeneration,
      isConnected
    }),
    [
      activeConversationId,
      currentGeneration,
      isGenerating,
      generationProgress,
      error,
      partialImages,
      finalImages,
      latestPartialImage,
      generateImages,
      clearError,
      resetGeneration,
      isConnected
    ]
  );

  return (
    <ImageGenContext.Provider value={value}>
      {children}
    </ImageGenContext.Provider>
  );
}

export function useImageGen() {
  const ctx = useContext(ImageGenContext);
  if (!ctx) throw new Error("useImageGen must be used within ImageGenProvider");
  return ctx;
}
