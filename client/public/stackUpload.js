import createChunks from "../src/App.js";

async function uploadFileChunks(file, chunkSize, maxConcurrentUpload) {
  const chunks = createChunks(file, chunkSize);
  let activeUploads = [];

  async function nextUploadFile() {
    if (chunks.length === 0) return;
    const chunk = chunks.shift();
    const upload = await uploadChunk(chunk);
    activeUploads.push(upload);
    nextUploadFile();
  }

  for (let index = 0; index < maxConcurrentUpload; index++) {
    if (chunks.length === 0) break;
    const chunk = chunks.shift();
    const upload = await uploadChunk(chunk);
    activeUploads.push(upload);
    await nextUploadFile();
  }

  Promise.all(activeUploads.map((chunk) => uploadChunk(chunk)));
}

await uploadFileChunks(file, 1024 * 1024, 5);

function uploadChunk(chunk) {
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      resolve(chunk);
    }, 1000);
  });
}
