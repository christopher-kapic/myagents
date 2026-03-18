import { pipeline, WhisperTextStreamer } from "@huggingface/transformers";

/**
 * Singleton factory for Whisper automatic-speech-recognition pipeline.
 * Keeps one model loaded in the worker at a time; disposes + reloads if model changes.
 */
class PipelineFactory {
  static task = "automatic-speech-recognition";
  static model = null;
  static instance = null;

  static async getInstance(progress_callback = null) {
    if (this.instance === null) {
      // Detect WebGPU availability inside the worker
      const hasWebGPU = typeof navigator !== "undefined" && !!navigator.gpu;

      this.instance = pipeline(this.task, this.model, {
        dtype: {
          encoder_model:
            this.model === "onnx-community/whisper-large-v3-turbo"
              ? "fp16"
              : "fp32",
          decoder_model_merged: "q4",
        },
        device: hasWebGPU ? "webgpu" : "wasm",
        progress_callback,
      });
    }
    return this.instance;
  }
}

self.addEventListener("message", async (event) => {
  const message = event.data;
  const transcript = await transcribe(message);
  if (transcript === null) return;

  self.postMessage({
    status: "complete",
    data: transcript,
  });
});

async function transcribe({ audio, model, subtask, language }) {
  const isDistilWhisper = model.startsWith("distil-whisper/");

  // Invalidate model if different from current
  if (PipelineFactory.model !== model) {
    PipelineFactory.model = model;
    if (PipelineFactory.instance !== null) {
      (await PipelineFactory.getInstance()).dispose();
      PipelineFactory.instance = null;
    }
  }

  // Load transcriber model (sends progress events to main thread)
  const transcriber = await PipelineFactory.getInstance((data) => {
    self.postMessage(data);
  });

  const time_precision =
    transcriber.processor.feature_extractor.config.chunk_length /
    transcriber.model.config.max_source_positions;

  const chunks = [];
  const chunk_length_s = isDistilWhisper ? 20 : 30;
  const stride_length_s = isDistilWhisper ? 3 : 5;

  let chunk_count = 0;
  let start_time;
  let num_tokens = 0;
  let tps;

  const streamer = new WhisperTextStreamer(transcriber.tokenizer, {
    time_precision,
    on_chunk_start: (x) => {
      const offset = (chunk_length_s - stride_length_s) * chunk_count;
      chunks.push({
        text: "",
        timestamp: [offset + x, null],
        finalised: false,
        offset,
      });
    },
    token_callback_function: () => {
      start_time ??= performance.now();
      if (num_tokens++ > 0) {
        tps = (num_tokens / (performance.now() - start_time)) * 1000;
      }
    },
    callback_function: (x) => {
      if (chunks.length === 0) return;
      chunks.at(-1).text += x;
      self.postMessage({
        status: "update",
        data: { text: "", chunks, tps },
      });
    },
    on_chunk_end: (x) => {
      const current = chunks.at(-1);
      current.timestamp[1] = x + current.offset;
      current.finalised = true;
    },
    on_finalize: () => {
      start_time = null;
      num_tokens = 0;
      ++chunk_count;
    },
  });

  const output = await transcriber(audio, {
    top_k: 0,
    do_sample: false,
    chunk_length_s,
    stride_length_s,
    language,
    task: subtask,
    return_timestamps: true,
    force_full_sequences: false,
    streamer,
  }).catch((error) => {
    console.error(error);
    self.postMessage({ status: "error", data: error });
    return null;
  });

  return output ? { tps, ...output } : null;
}
