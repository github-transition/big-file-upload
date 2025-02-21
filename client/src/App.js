import { CloudUploadOutlined } from "@ant-design/icons";
import { Button, message, Progress } from "antd";
import axios from "axios";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "./App.css";
import { FILE_CHUNK_SIZE } from "./constant";
import useDrag from "./hooks/useDrag";
import request from "./request";

const UploadStatus = {
  NOT_START: "NOT_START", // 初始状态
  UPLOADING: "UPLOADING", // 上传中
  PAUSE: "PAUSE", // 暂停异
};

function App() {
  const dragRef = useRef(null);
  const { selectFile, previewFile, resetFileStatus } = useDrag(dragRef);
  const [uploadStatus, setUploadStatus] = useState(UploadStatus.NOT_START);
  const [cancelToken, setCancelToken] = useState([]);
  const [uploadProgress, setUploadProgress] = useState({});
  const [filenameWorker, setFilenameWorker] = useState(null);

  useEffect(() => {
    const worker = new Worker("/filenameWorker.js");
    setFilenameWorker(worker);
  }, []);

  const resetAllStatus = useCallback(() => {
    resetFileStatus();
    setUploadProgress({});
    setUploadStatus(UploadStatus.NOT_START);
  }, [resetFileStatus, setUploadProgress, setUploadStatus]);

  const handleUploadFile = useCallback(async () => {
    if (!selectFile) {
      message.error("请先选择文件");
      return;
    }
    setUploadStatus(UploadStatus.UPLOADING);
    console.time("计算文件哈希用时（毫秒）");
    filenameWorker.postMessage(selectFile);
    filenameWorker.onmessage = async (event) => {
      const fileName = event.data;
      console.timeEnd("计算文件哈希用时（毫秒）");
      await uploadFile({
        file: selectFile,
        fileName,
        setUploadProgress,
        resetAllStatus,
        setCancelToken,
      });
    };
  }, [
    selectFile,
    setUploadStatus,
    setUploadProgress,
    resetAllStatus,
    setCancelToken,
    filenameWorker,
  ]);

  const handlePauseUpload = useCallback(() => {
    cancelToken.forEach((cancelToken) =>
      cancelToken.cancel("用户主动暂停上传")
    );
    setUploadStatus(UploadStatus.PAUSE);
  }, [cancelToken, setUploadStatus]);

  const handleResumeUpload = useCallback(async () => {
    setUploadStatus(UploadStatus.UPLOADING);
    await handleUploadFile();
  }, [handleUploadFile]);

  const uploadFileButton = useMemo(() => {
    switch (uploadStatus) {
      case UploadStatus.NOT_START:
        return (
          <Button type="primary" shape="around" onClick={handleUploadFile}>
            上传文件
          </Button>
        );
      case UploadStatus.UPLOADING:
        return (
          <Button type="primary" shape="around" onClick={handlePauseUpload}>
            暂停
          </Button>
        );
      case UploadStatus.PAUSE:
        return (
          <Button type="primary" shape="around" onClick={handleResumeUpload}>
            继续
          </Button>
        );
      default:
        return null;
    }
  }, [uploadStatus, handleUploadFile, handlePauseUpload, handleResumeUpload]);

  const renderTotalProgress = useMemo(() => {
    const totalProgress =
      Math.round(
        Object.values(uploadProgress).reduce((acc, curr) => acc + curr, 0) /
          Object.keys(uploadProgress).length
      ) || null;
    return (
      totalProgress && (
        <div style={{ width: "100%" }}>
          <div>总进度:{totalProgress}</div>
          <Progress type="circle" percent={totalProgress} />
        </div>
      )
    );
  }, [uploadProgress]);

  const renderProgress = useMemo(() => {
    return Object.keys(uploadProgress).map((key, index) => {
      return (
        <div key={key} style={{ width: "100%" }}>
          <div>分片:{index + 1}</div>
          <Progress percent={uploadProgress[key]} />
        </div>
      );
    });
  }, [uploadProgress]);
  return (
    <div className="upload-container" ref={dragRef}>
      {showFile(previewFile)}
      <p className="upload-text">
        drag the file to this area to upload and click the button to upload
      </p>
      {uploadFileButton}
      {renderTotalProgress}
      {renderProgress}
    </div>
  );
}

const uploadFile = async ({
  file,
  fileName,
  setUploadProgress,
  resetAllStatus,
  setCancelToken,
}) => {
  const { needUpload, chunkFileSizes, path } = await request.get(
    `/verify/${fileName}`
  );
  // 如果 needUpload 为 false，表示该文件服务端已经存在，则直接返回
  if (!needUpload) {
    message.success("文件已存在秒传成功" + path);
    return resetAllStatus();
  }
  // 把文件进行切片操作
  const chunks = await createFileChunks(file, fileName);
  const cancelTokens = [];

  // 创建 Promise 数组
  const requests = chunks.map(({ chunk, chunkFileName }) => {
    // 创建取消Token，每次都创建新的取消Token
    const cancelToken = axios.CancelToken.source();
    // 把取消Token添加到数组中
    cancelTokens.push(cancelToken);
    // 以后往服务端发送的文件可能不是完整的了
    // existingChunk 表示已经上传的分片文件
    const existingChunk = chunkFileSizes.find(
      (item) => item.chunkFileName === chunkFileName
    );
    if (existingChunk) {
      // 获取已经上传的分片文件的大小
      const uploadedSize = existingChunk.chunkFileSize;
      // 获取剩余的分片文件
      const remainingChunk = chunk.slice(uploadedSize);
      // 如果文件大小为 0,表示该文件已经上传完毕了
      if (uploadedSize === 0) {
        // 上传完的文件进度设置为100
        setUploadProgress((prevProgress) => ({
          ...prevProgress,
          [chunkFileName]: 100,
        }));
        return Promise.resolve();
      }
      return createRequest({
        fileName,
        chunk: remainingChunk,
        chunkFileName,
        setUploadProgress,
        cancelToken,
        loadedSize: uploadedSize,
        totalChunkSize: chunk.size,
      });
    } else {
      // 如果文件不存在，则表示该文件是第一次上传
      return createRequest({
        fileName,
        chunk,
        chunkFileName,
        setUploadProgress,
        cancelToken,
        loadedSize: 0,
        totalChunkSize: chunk.size,
      });
    }
  });
  setCancelToken(cancelTokens);
  try {
    // 并行上传每个分片
    await Promise.all(requests);
    // 合并文件
    const mergeRes = await request.get(`/merge/${fileName}`);
    message.success(mergeRes.message);
    resetAllStatus();
  } catch (error) {
    if (axios.isCancel(error)) {
      message.warning(error.message);
    } else {
      message.error("上传失败");
      console.error(error);
    }
  }
};

const createRequest = ({
  fileName,
  chunk,
  chunkFileName,
  setUploadProgress,
  cancelToken,
  loadedSize,
  totalChunkSize,
}) => {
  return request.post(`/upload/${fileName}`, chunk, {
    headers: {
      "Content-Type": "application/octet-stream",
    },
    params: {
      chunkFileName,
      start: loadedSize,
    },
    onUploadProgress: (ProgressEvent) => {
      const progress = Math.round(
        ((ProgressEvent.loaded + loadedSize) * 100) / totalChunkSize
      );
      setUploadProgress((prevProgress) => ({
        ...prevProgress,
        [chunkFileName]: progress,
      }));
    },
    cancelToken: cancelToken.token,
  });
};

const createFileChunks = async (file, fileName) => {
  const chunks = [];
  const sliceSize = Math.ceil(file.size / FILE_CHUNK_SIZE);
  for (let index = 0; index < sliceSize; index++) {
    const chunk = file.slice(
      index * FILE_CHUNK_SIZE,
      (index + 1) * FILE_CHUNK_SIZE
    );
    chunks.push({
      chunk,
      chunkFileName: `${fileName}-${index}`,
    });
  }
  return chunks;
};

const showFile = (previewFile) => {
  if (!previewFile.url) {
    return <CloudUploadOutlined className="upload-icon" />;
  }
  if (previewFile.type.startsWith("image/")) {
    return <img className="upload-file" src={previewFile.url} alt="upload" />;
  } else if (previewFile.type.startsWith("video/")) {
    return <video className="upload-file" src={previewFile.url} controls />;
  } else {
    return previewFile.url;
  }
};

// const getFileName = async (file) => {
//   const fileHash = await calculateFileHas(file);
//   const fileExtension = file.name.split(".").pop();
//   return `${fileHash}.${fileExtension}`;
// };

// // 计算文件hash
// const calculateFileHas = async (file) => {
//   // 将文件转换为ArrayBuffer
//   const fileBuffer = await file.arrayBuffer();
//   // 使用SHA-256算法计算哈希值，返回ArrayBuffer
//   const hashBuffer = await crypto.subtle.digest("SHA-256", fileBuffer);
//   // 将ArrayBuffer转换为Uint8Array，再转换为普通数组
//   const hashArray = Array.from(new Uint8Array(hashBuffer));
//   // 将每个字节转换为16进制字符串，并拼接
//   const hashHex = hashArray
//     .map((b) => b.toString(16).padStart(2, "0"))
//     .join("");
//   return hashHex; // 返回最终的哈希字符串
// };

export default App;
