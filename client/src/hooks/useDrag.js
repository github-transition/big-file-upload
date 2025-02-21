import { message } from "antd";
import { useCallback, useEffect, useState } from "react";
import { FILE_MAX_SIZE } from "../constant";

export default function useDrag(uploadContainerRef) {
  const [selectFile, setSelectFile] = useState(null);
  const [previewFile, setPreviewFile] = useState({
    url: null,
    type: null,
  });

  const resetFileStatus = () => {
    setSelectFile(null);
    setPreviewFile({
      url: null,
      type: null,
    });
  };

  const handleDrag = useCallback((event) => {
    event.preventDefault();
    event.stopPropagation();
  }, []);

  const handleDrop = useCallback((event) => {
    event.preventDefault();
    event.stopPropagation();
    checkFile(event.dataTransfer.files);
  }, []);

  const checkFile = (files) => {
    const file = files[0];
    if (!file) {
      message.error("没有选择任何文件");
      return;
    }

    if (file.size > FILE_MAX_SIZE) {
      message.error("文件过大");
      return;
    }

    if (!(file.type.startsWith("image/") || file.type.startsWith("video/"))) {
      message.error("上传资源不支持");
      return;
    }

    setSelectFile(file);
  };

  useEffect(() => {
    if (!selectFile) {
      return;
    }
    const filePath = URL.createObjectURL(selectFile);
    setPreviewFile({
      url: filePath,
      type: selectFile.type,
    });
    return () => {
      URL.revokeObjectURL(filePath);
    };
  }, [selectFile]);

  useEffect(() => {
    console.log("触发effect", uploadContainerRef);

    const uploadContainer = uploadContainerRef.current;
    uploadContainer.addEventListener("dragover", handleDrag);
    uploadContainer.addEventListener("drop", handleDrop);
    return () => {
      uploadContainer.removeEventListener("dragover", handleDrag);
      uploadContainer.removeEventListener("drop", handleDrop);
    };
  }, [uploadContainerRef, handleDrag, handleDrop]);

  return {
    selectFile,
    previewFile,
    resetFileStatus,
  };
}
