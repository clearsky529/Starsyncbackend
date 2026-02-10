export enum SUBSCRIPTION {
  NOT_STARTED = 0,
  IN_PROGRESS = 1,
  FINISHED = 2,
}

export enum SYNCACTION {
  ADD = 'add',
  UPDATE = 'update',
  DELETE = 'delete',
}

export enum NOTIFICATION {
  JOIN_PROJECT = 'joinProject',
  LEAVE_PROJECT = 'leaveProject',
}

export enum EVENT_TYPE {
  SYNC = 'sync',
  NOTIFICATION = 'notification',
  JOIN_PROJECT = 'joinProject',
  LEAVE_PROJECT = 'leaveProject',
  REGISTER_USER = 'registerUser',
  SHARE_PROJECT = 'shareProject',
  SHARE_PROJECT_UPDATE = 'shareProjectUpdate',
  SHARE_PROJECT_ACK = 'shareProjectAck',
  SHARE_PROJECT_ERROR = 'shareProjectError',
  UNDO = 'undo',
  REDO = 'redo',
  CURSOR_POSITION = 'cursorPosition',
  PLAYBACK_STATE = 'playbackState',
  TEMPO_CHANGE = 'tempoChange',
  TEMPO_AUTOMATION = 'tempoAutomation',
  MARKER_ADDED = 'markerAdded',
  MARKER_UPDATED = 'markerUpdated',
  MARKER_DELETED = 'markerDeleted',
  LOCK_REQUEST = 'lockRequest',
  LOCK_ACQUIRED = 'lockAcquired',
  LOCK_DENIED = 'lockDenied',
  LOCK_RELEASED = 'lockReleased',
  LOCK_EXPIRED = 'lockExpired',
  EDIT_QUEUED = 'editQueued',
  ERROR = 'error',
  
  // Automation events
  AUTOMATION_LANE_CREATE = 'automationLaneCreate',
  AUTOMATION_LANE_DELETE = 'automationLaneDelete',
  AUTOMATION_LANE_UPDATE = 'automationLaneUpdate',
  AUTOMATION_POINT_ADD = 'automationPointAdd',
  AUTOMATION_POINT_REMOVE = 'automationPointRemove',
  AUTOMATION_POINT_MOVE = 'automationPointMove',
  
  // Plugin events
  PLUGIN = 'plugin',
}
