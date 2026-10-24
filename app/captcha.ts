import { calculateCaptcha } from "../shared/auth";

type OrtModule = typeof import("onnxruntime-web/wasm");

let sessionPromise: Promise<import("onnxruntime-web/wasm").InferenceSession> | null = null;

async function getSession(ort: OrtModule) {
  if (!sessionPromise) {
    ort.env.wasm.wasmPaths = "/ort/";
    ort.env.wasm.numThreads = 1;
    sessionPromise = ort.InferenceSession.create("/captcha-model.onnx", { executionProviders: ["wasm"] });
  }
  return sessionPromise;
}

async function imageTensor(ort: OrtModule, imageUrl: string) {
  const response = await fetch(imageUrl, { cache: "no-store" });
  if (!response.ok) throw new Error("验证码图片读取失败。");
  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error("验证码图片解码失败。"));
      element.src = objectUrl;
    });
    const width = 130;
    const height = 42;
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("当前浏览器无法识别验证码。");
    context.drawImage(image, 0, 0, width, height);
    const pixels = context.getImageData(0, 0, width, height).data;
    const plane = width * height;
    const values = new Float32Array(plane * 3);
    for (let index = 0; index < plane; index++) {
      values[index] = pixels[index * 4] / 255;
      values[plane + index] = pixels[index * 4 + 1] / 255;
      values[plane * 2 + index] = pixels[index * 4 + 2] / 255;
    }
    return new ort.Tensor("float32", values, [1, 3, height, width]);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export async function solveCaptcha(imageUrl: string) {
  const ort = await import("onnxruntime-web/wasm");
  const session = await getSession(ort);
  const tensor = await imageTensor(ort, imageUrl);
  const output = await session.run({ [session.inputNames[0]]: tensor });
  const result = output[session.outputNames[0]];
  const values = result.data as Float32Array;
  const classes = 15;
  const steps = Math.floor(values.length / classes);
  const charset = [" ", "0", "1", "2", "3", "4", "5", "6", "7", "8", "9", "+", "-", "*", "="];
  const predicted: number[] = [];
  for (let step = 0; step < steps; step++) {
    let bestIndex = 0;
    let bestValue = Number.NEGATIVE_INFINITY;
    for (let index = 0; index < classes; index++) {
      const value = Number(values[step * classes + index]);
      if (value > bestValue) { bestValue = value; bestIndex = index; }
    }
    predicted.push(bestIndex);
  }
  const expression = predicted.filter((value, index) => value !== 0 && value !== predicted[index - 1]).map(value => charset[value] || "").join("");
  const answer = calculateCaptcha(expression);
  if (answer === null) throw new Error("验证码自动识别失败。");
  return { expression, answer };
}
