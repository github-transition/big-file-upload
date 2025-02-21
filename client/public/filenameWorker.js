/* eslint-disable no-restricted-globals */
// 获取文件名
const getFileName = async (file) => {
  const fileHash = await calculateFileHas(file);
  const fileExtension = file.name.split(".").pop();
  return `${fileHash}.${fileExtension}`;
};

// 计算文件hash
const calculateFileHas = async (file) => {
  // 将文件转换为ArrayBuffer
  const fileBuffer = await file.arrayBuffer();
  // 使用SHA-256算法计算哈希值，返回ArrayBuffer
  const hashBuffer = crypto.subtle.digest("SHA-256", fileBuffer).then((res) => {
    console.log("arrayBuffer", res);
  });
  // 将ArrayBuffer转换为Uint8Array，再转换为普通数组
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  // 将每个字节转换为16进制字符串，并拼接
  const hashHex = hashArray
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return hashHex; // 返回最终的哈希字符串
};

self.addEventListener("message", async (event) => {
  const file = event.data;
  const fileName = await getFileName(file);
  self.postMessage(fileName);
});
