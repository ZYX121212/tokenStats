import gzip
import shutil
import time
from datetime import datetime, timedelta
from pathlib import Path
from typing import List, Optional


class BackupManager:
    """数据备份管理器"""
    
    def __init__(self, db_path: Path, backup_dir: Optional[Path] = None, retention_days: int = 30):
        """
        初始化备份管理器
        
        Args:
            db_path: 数据库文件路径
            backup_dir: 备份目录，默认为数据库所在目录的 backups 子目录
            retention_days: 备份保留天数
        """
        self.db_path = Path(db_path)
        self.backup_dir = backup_dir or (self.db_path.parent / "backups")
        self.retention_days = retention_days
        
        # 确保备份目录存在
        self.backup_dir.mkdir(parents=True, exist_ok=True)
        
    def create_backup(self) -> Optional[Path]:
        """
        创建数据库备份
        
        Returns:
            备份文件路径，如果失败则返回 None
        """
        try:
            # 生成备份文件名
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            backup_filename = f"tokenstats_backup_{timestamp}.db.gz"
            backup_path = self.backup_dir / backup_filename
            
            # 压缩备份
            with open(self.db_path, "rb") as f_in:
                with gzip.open(backup_path, "wb") as f_out:
                    shutil.copyfileobj(f_in, f_out)
                    
            return backup_path
        except Exception:
            return None
            
    def restore_backup(self, backup_path: Path) -> bool:
        """
        从备份恢复数据库
        
        Args:
            backup_path: 备份文件路径
            
        Returns:
            是否恢复成功
        """
        try:
            # 先创建当前数据库的备份
            self.create_backup()
            
            # 恢复备份
            with gzip.open(backup_path, "rb") as f_in:
                with open(self.db_path, "wb") as f_out:
                    shutil.copyfileobj(f_in, f_out)
                    
            return True
        except Exception:
            return False
            
    def list_backups(self) -> List[Path]:
        """
        列出所有备份文件
        
        Returns:
            备份文件路径列表，按时间倒序排列
        """
        try:
            backups = sorted(
                self.backup_dir.glob("tokenstats_backup_*.db.gz"),
                key=lambda p: p.stat().st_mtime,
                reverse=True
            )
            return backups
        except Exception:
            return []
            
    def cleanup_old_backups(self) -> int:
        """
        清理过期的备份文件
        
        Returns:
            删除的文件数量
        """
        try:
            cutoff_time = time.time() - (self.retention_days * 24 * 3600)
            backups = self.list_backups()
            deleted_count = 0
            
            for backup in backups:
                if backup.stat().st_mtime < cutoff_time:
                    backup.unlink()
                    deleted_count += 1
                    
            return deleted_count
        except Exception:
            return 0
            
    def get_backup_info(self, backup_path: Path) -> dict:
        """
        获取备份文件信息
        
        Args:
            backup_path: 备份文件路径
            
        Returns:
            备份信息字典
        """
        try:
            stat = backup_path.stat()
            return {
                "path": backup_path,
                "size": stat.st_size,
                "created": datetime.fromtimestamp(stat.st_mtime),
                "name": backup_path.name,
            }
        except Exception:
            return {}
            
    def auto_backup(self) -> Optional[Path]:
        """
        自动备份（带清理）
        
        Returns:
            备份文件路径，如果失败则返回 None
        """
        # 清理旧备份
        self.cleanup_old_backups()
        
        # 创建新备份
        return self.create_backup()
