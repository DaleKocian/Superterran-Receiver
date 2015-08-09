// Copyright 2015 Google Inc. All Rights Reserved.
// 
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
// 
//     http://www.apache.org/licenses/LICENSE-2.0
// 
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.
goog.provide('cast.games.superterran.SuperterranGame');

goog.require('cast.games.common.receiver.Game');



/**
 * Superterran game.
 *
 * Shows a spaceship for each AVAILABLE player. Automatically transitions
 * AVAILABLE players to PLAYING. Moves spaceships and fires "bullets" at
 * incoming rockets when senders send a custom game message.
 *
 * @param {!cast.receiver.games.GameManager} gameManager
 * @constructor
 * @implements {cast.games.common.receiver.Game}
 * @export
 */
cast.games.superterran.SuperterranGame = function(gameManager) {
  /** @private {!cast.receiver.games.GameManager} */
  this.gameManager_ = gameManager;

  /**
   * Debug only. Call debugUi.open() or close() to show and hide an overlay
   * showing game manager and player information while testing and debugging.
   * @public {cast.receiver.games.debug.DebugUI}
   */
  this.debugUi = new cast.receiver.games.debug.DebugUI(this.gameManager_);

  /**
   * Debug only. Set to true to allow players to move and fire by themselves.
   * Requires players to be added beforehand. Useful for testing and debugging.
   * For standalone testing on a locally hosted web server with no senders,
   * you can add a virtual player by typing this in the dev console in one line:
   * game.gameManager_.updatePlayerState(null, cast.receiver.games.PlayerState.
   * AVAILABLE)
   * @public {boolean}
   */
  this.randomAiEnabled = false;

  /** @private {number} */
  this.canvasWidth_ = window.innerWidth;

  /** @private {number} */
  this.canvasHeight_ = window.innerHeight;

  /** @private {number} */
  this.DISPLAY_BORDER_BUFFER_WIDTH_ = window.innerWidth / 2;

  /** @private {number} */
  this.MAX_PLAYERS_ = 4;

  /** @private {number} */
  this.MAX_ENEMIES_ = 5;

  /** @private {number} */
  this.MAX_PLAYER_BULLETS_ = 20;

  /** @private {number} */
  this.MAX_PLAYER_SPEED_ = 10;

  /** @private {number} */
  this.MAX_PLAYER_ACCEL_ = 2.5;

  /** @private {number} */
  this.MAX_EXPLOSIONS_ = 5;

  /** @private {number} */
  this.MIN_SPEED_ = 5;

  /** @private {number} */
  this.MAX_SPEED_ = 15;

  /** @private {number} */
  this.BOOST_FACTOR_ = 3;

  /** @private {number} */
  this.BOOST_DECAY_ = 0.05;

  /** @private {number} */
  this.BOOST_RECOVER_ = 0.025;

  /** @private {number} */
  this.BULLET_SPEED_ = 40;
  
  this.WINNING_SCORE_ = 20;
  
  this.winningMsg;

  /** @private {string} */
  this.MULTIPLE_FIRE_MESSAGES_ERROR_ =
      'Multiple fire messages on a single frame: ';

  /** @private {!Array.<!PIXI.Sprite>} All player sprites. */
  this.players_ = [];

  /**
   * A map from player indexs to player ids.
   * @private {!Object.<int, string>}.
   */
  this.playerIdMap_ = {};

  /**
   * A map from player ids to player sprites.
   * @private {!Object.<string, !PIXI.Sprite>}.
   */
  this.playerMap_ = {};

  /** @private {!Array.<!PIXI.Sprite>} All enemy sprites. */
  this.enemies_ = [];

  /*** @private {!Uint32Array} All enemy speeds. */
  this.enemySpeeds_ = new Uint32Array(this.MAX_ENEMIES_);

  /** @private {!Uint32Array} Used for loop iterators in #update */
  this.loopIterator_ = new Uint32Array(2);

  /** @private {!Array.<!PIXI.Sprite>} All player bullets. */
  this.playerBullets_ = [];

  /** @private {PIXI.Sprite} The background. */
  this.backgroundSprite_ = null;

  /** @private {!Array.<!PIXI.Texture>} All astroid textures. */
  this.astroidTextures_ = [];

  /** @private {!Array.<!PIXI.Texture>} All explosion textures. */
  this.explosionTextures_ = [];

  /** @private {!Array.<!PIXI.extras.MovieClip>} All explosion movie clips. */
  this.explosions_ = [];

  /** @private {boolean} True if there is already a fire message this frame. */
  this.fireThisFrame_ = true;

  /** @private {function(number)} Pre-bound call to #update. */
  this.boundUpdateFunction_ = this.update_.bind(this);

  /** @private {boolean} */
  this.isLoaded_ = false;

  /** @private {boolean} */
  this.isRunning_ = false;
  this.isShowingWin_ = false;

  /** @private {!PIXI.Container} */
  this.container_ = new PIXI.Container();

  /** @private {!PIXI.WebGLRenderer} */
  this.renderer_ = new PIXI.WebGLRenderer(this.canvasWidth_,
      this.canvasHeight_);

  /** @private {!PIXI.loaders.Loader} */
  this.loader_ = new PIXI.loaders.Loader();
  this.loader_.add('assets/background.jpg');
  this.loader_.add('assets/pluto.png');
  for (var i = 0; i < 30; i++) {
    this.loader_.add('assets/astroid' + (i + 1) + ".jpeg");
  }
  this.loader_.add('assets/enemy.png');
  this.loader_.add('assets/explosion.json');
  this.loader_.add('assets/explosion.png');
  this.loader_.add('assets/player_bullet.png');
  this.loader_.once('complete', this.onAssetsLoaded_.bind(this));

  /** @private {?function()} Callback used with #run. */
  this.loadedCallback_ = null;

  /**
   * Pre-bound message callback.
   * @private {function(cast.receiver.games.Event)}
   */
  this.boundGameMessageCallback_ = this.onGameMessage_.bind(this);

  /**
   * Pre-bound player connect callback.
   * @private {function(cast.receiver.games.Event)}
   */
  this.boundPlayerAvailableCallback_ = this.onPlayerAvailable_.bind(this);

  /**
   * Pre-bound player quit callback.
   * @private {function(cast.receiver.games.Event)}
   */
  this.boundPlayerQuitCallback_ = this.onPlayerQuit_.bind(this);
};

/**
 * JSON message field used for playername
 */
 cast.games.superterran.SuperterranGame.PLAYER_NAME='user_name';

/**
 * JSON message field used to boost.
 * @private
 */
cast.games.superterran.SuperterranGame.BOOST_FIELD_ = 'boost';


/**
 * JSON message field used to move.
 * @private
 */
cast.games.superterran.SuperterranGame.MOVE_FIELD_ = 'move';


/**
 * JSON message field used to move.
 * @private
 */
cast.games.superterran.SuperterranGame.GRAVITY_FIELD_ = 'super_gravity';


/**
 * Runs the game. Game should load if not loaded yet.
 * @param {function()} loadedCallback This function will be called when the game
 *     finishes loading or is already loaded and about to actually run.
 * @export
 */
cast.games.superterran.SuperterranGame.prototype.run = function(loadedCallback) {
  // If the game is already running, return immediately.
  if (this.isRunning_) {
    loadedCallback();
    return;
  }

  // Start loading if game not loaded yet.
  this.loadedCallback_ = loadedCallback;
  if (!this.isLoaded_) {
    this.loader_.load();
    return;
  }

  // Start running.
  this.start_();
};


/**
 * Stops the game.
 * @export
 */
cast.games.superterran.SuperterranGame.prototype.stop = function() {
  if (this.loadedCallback_ || !this.isRunning_) {
    this.loadedCallback_ = null;
    return;
  }

  this.isRunning_ = false;
  document.body.removeChild(this.renderer_.view);

  this.gameManager_.removeEventListener(
      cast.receiver.games.EventType.GAME_MESSAGE_RECEIVED,
      this.boundGameMessageCallback_);
  this.gameManager_.removeEventListener(
      cast.receiver.games.EventType.PLAYER_AVAILABLE,
      this.boundPlayerAvailableCallback_);
  this.gameManager_.removeEventListener(
      cast.receiver.games.EventType.PLAYER_QUIT,
      this.boundPlayerQuitCallback_);
  this.gameManager_.removeEventListener(
      cast.receiver.games.EventType.PLAYER_DROPPED,
      this.boundPlayerQuitCallback_);
};


/**
 * Adds the renderer and run the game. Calls loaded callback passed to #run.
 * @private
 */
cast.games.superterran.SuperterranGame.prototype.start_ = function() {
  // If callback is null, the game was stopped already.
  // if (!this.loadedCallback_) {
  //   return;
  // }

  document.body.appendChild(this.renderer_.view);
  this.isRunning_ = true;
  this.gameManager_.updateGameplayState(
      cast.receiver.games.GameplayState.RUNNING, null);

  // Add any already connected players.
  var players = this.gameManager_.getPlayers();
  for (var i = 0; i < players.length; i++) {
    this.addPlayer_(players[i].playerId);
  }

  requestAnimationFrame(this.boundUpdateFunction_);

  this.loadedCallback_();
  this.loadedCallback_ = null;

  this.gameManager_.addEventListener(
      cast.receiver.games.EventType.GAME_MESSAGE_RECEIVED,
      this.boundGameMessageCallback_);
  this.gameManager_.addEventListener(
      cast.receiver.games.EventType.PLAYER_AVAILABLE,
      this.boundPlayerAvailableCallback_);
  this.gameManager_.addEventListener(
      cast.receiver.games.EventType.PLAYER_QUIT,
      this.boundPlayerQuitCallback_);
  this.gameManager_.addEventListener(
      cast.receiver.games.EventType.PLAYER_DROPPED,
      this.boundPlayerQuitCallback_);
};


/**
 * Called when all assets are loaded.
 * @private
 */
cast.games.superterran.SuperterranGame.prototype.onAssetsLoaded_ = function() {
  this.backgroundSprite_ =
      PIXI.Sprite.fromImage('assets/background.jpg');
  this.backgroundSprite_.width = this.canvasWidth_;
  this.backgroundSprite_.height = this.canvasHeight_;
  this.container_.addChild(this.backgroundSprite_);

  for (var i = 0; i < this.MAX_PLAYERS_; i++) {
    var player = PIXI.Sprite.fromImage('assets/pluto.png');
    player.anchor.x = 0.5;
    player.anchor.y = 0.5;
    player.position.x = 60;
    player.position.y = this.canvasHeight_ / 2;
    player.scale.x = player.scale.y = 1;
    player.visible = false;
    player.height=50;
    player.width=50;
    this.container_.addChild(player);
    this.players_.push(player);
  }

  for (var i = 0; i < 30; i++) {
    var astroidTexture = PIXI.Texture.fromImage('assets/astroid' + (i + 1) + ".png");
    this.astroidTextures_.push(astroidTexture);
  }

  for (var i = 0; i < this.MAX_ENEMIES_; i++) {
    var astroid = new PIXI.extras.MovieClip(this.astroidTextures_);
    astroid.anchor.x = 0.5;
    astroid.anchor.y = 0.5;
    astroid.position.x = -(astroid.texture.width +
            this.DISPLAY_BORDER_BUFFER_WIDTH_);
    astroid.position.y = 0;
    this.container_.addChild(astroid);

    this.enemies_.push(astroid);
    this.enemySpeeds_[i] = 0;
  }

  for (var i = 0; i < this.MAX_PLAYER_BULLETS_; i++) {
    var bullet = PIXI.Sprite.fromImage('assets/player_bullet.png');
    bullet.anchor.x = 0.5;
    bullet.anchor.y = 0.5;
    bullet.position.x = 0;
    bullet.position.y = 0;
    bullet.visible = false;
    this.container_.addChild(bullet);

    this.playerBullets_.push(bullet);
  }

  for (var i = 0; i < 12; i++) {
    var explosionTexture = PIXI.Texture.fromFrame('explosion' + (i + 1));
    this.explosionTextures_.push(explosionTexture);
  }

  for (var i = 0; i < this.MAX_EXPLOSIONS_; i++) {
    var explosion = new PIXI.extras.MovieClip(this.explosionTextures_);
    explosion.anchor.x = 0.5;
    explosion.anchor.y = 0.5;
    explosion.position.x = 0;
    explosion.position.y = 0;
    explosion.visible = false;
    explosion.loop = false;
    explosion.onComplete = goog.bind(this.hideExplosion_, this, explosion);

    this.container_.addChild(explosion);
    this.explosions_.push(explosion);
  }

  this.start_();
};


/**
 * Updates the game on each animation frame.
 * @param {number} timestamp
 * @private
 */
cast.games.superterran.SuperterranGame.prototype.update_ = function(timestamp) {
  if (!this.isRunning_) {
    return;
  }
  requestAnimationFrame(this.boundUpdateFunction_);
  this.fireThisFrame_ = false;
  var players = this.gameManager_.getPlayers(); 
  for (this.loopIterator_[0] = 0; this.loopIterator_[0] < players.length;this.loopIterator_[0]++) {
    var player = players[this.loopIterator_[0]];
    if (this.randomAiEnabled) {
      this.onPlayerMessage_(player, Math.random() * 360, false, false, false);
    } 
    this.updatePlayer_();
  }
  for (this.loopIterator_[0] = 0; this.loopIterator_[0] < this.MAX_ENEMIES_;
      this.loopIterator_[0]++) {
    this.updateEnemy_();
  }

  for (this.loopIterator_[0] = 0;
      this.loopIterator_[0] < this.MAX_PLAYER_BULLETS_;
      this.loopIterator_[0]++) {
    this.updateBullet_();
  }

  this.renderer_.render(this.container_);
};

/**
 * RESTART THE GAME
 */
cast.games.superterran.SuperterranGame.prototype.restartGame_ = function() {
   this.isRunning_ = false;

   this.container_.addChild(this.winningMsg);
   this.renderer_.render(this.container_);

   setTimeout(function() {
       this.game.isRunning_ = true;
       this.game.update_();
       this.game.container_.removeChild(this.game.winningMsg);
       this.game.winningMsg.destroy();
      }, 5000);
      for (this.loopIterator_[0] = 0; this.loopIterator_[0] < this.players_.length; this.loopIterator_[0]++) {
        var index = this.loopIterator_[0];
        var playerId = this.playerIdMap_[index];
        if (!playerId) {
          continue;
        }
        var playerSprite = this.players_[index];
        var playerData = this.gameManager_.getPlayer(playerId)["playerData"];
        playerSprite.position.y = this.canvasHeight_ / 2;;
        playerSprite.position.x = 60;
        playerSprite.height = 50;
        playerSprite.width = 50;
        playerData.mass = 0;
        playerData.vel_x = 0;
        playerData.vel_y=0;
        this.gameManager_.updatePlayerData(this.gameManager_.getPlayer(this.playerIdMap_[index])["playerId"], playerData);    
      }
}

/**
 * Handles when a player becomes available to the game manager.
 * @param {cast.receiver.games.Event} event
 * @private
 */
cast.games.superterran.SuperterranGame.prototype.onPlayerAvailable_ =
    function(event) {
  if (event.statusCode != cast.receiver.games.StatusCode.SUCCESS) {
    console.log('Error: Event status code: ' + event.statusCode);
    console.log('Reason for error: ' + event.errorDescription);
    return;
  }


  var playerId = /** @type {string} */ (event.playerInfo.playerId);
  // Automatically transition available players to playing state.
  this.gameManager_.updatePlayerState(playerId,
      cast.receiver.games.PlayerState.PLAYING, null);

  this.addPlayer_(playerId);
};


/**
 * Adds a player to the game.
 * @param {string} playerId
 * @private
 */
cast.games.superterran.SuperterranGame.prototype.addPlayer_ = function(playerId) {
  // Check if player is already on the screen.
  var playerSprite = this.playerMap_[playerId];
  if (playerSprite && playerSprite.visible) {
    return;
  }

  // Assign first available player sprite to new player.
  for (var i = 0; i < this.MAX_PLAYERS_; i++) {
    var player = this.players_[i];
    if (player && !player.visible) {
      // Associate player sprite with player ID.
      this.playerMap_[playerId] = player;
      this.playerIdMap_[i] = playerId;
      player.visible = true;
      player.tint = Math.random() * 0xffffff;
      break;
    }
  }

  // Preassign player data
  var playerData = {
                  "mass" : 0,
                  "vel_x": 0,
                  "vel_y": 0,
                  "boost": 1.0,
                  "playerName": "Pluto"
               };  
  this.gameManager_.updatePlayerData(playerId, playerData);

};


/**
 * Handles when a player disconnects from the game manager.
 * @param {cast.receiver.games.Event} event
 * @private
 */
cast.games.superterran.SuperterranGame.prototype.onPlayerQuit_ =
    function(event) {
  if (event.statusCode != cast.receiver.games.StatusCode.SUCCESS) {
    console.log('Error: Event status code: ' + event.statusCode);
    console.log('Reason for error: ' + event.errorDescription);
    return;
  }

  var playerSprite = this.playerMap_[event.playerInfo.playerId];
  if (playerSprite) {
    playerSprite.visible = false;
  }
  delete this.playerMap_[event.playerInfo.playerId];

  // Tear down the game if there are no more players. Might want to show a nice
  // UI with a countdown instead of tearing down instantly.
  var connectedPlayers = this.gameManager_.getConnectedPlayers();
  if (connectedPlayers.length == 0) {
    console.log('No more players connected. Tearing down game.');
    cast.receiver.CastReceiverManager.getInstance().stop();
  }
};


/**
 * Handles incoming messages.
 * @param {cast.receiver.games.Event} event
 * @private
 */
cast.games.superterran.SuperterranGame.prototype.onGameMessage_ = function(event) {

  if (event.statusCode != cast.receiver.games.StatusCode.SUCCESS) {
    console.log('Error: Event status code: ' + event.statusCode);
    console.log('Reason for error: ' + event.errorDescription);

    return;
  }

  var player =
      this.gameManager_.getPlayer(event.playerInfo.playerId);
  if (!player) {
    throw Error('No player found for player ID ' + event.playerInfo.playerId);
  }

  var moveField = event.requestExtraMessageData[
      cast.games.superterran.SuperterranGame.MOVE_FIELD_];
  var boostField = event.requestExtraMessageData[
      cast.games.superterran.SuperterranGame.BOOST_FIELD_];
  var gravityField = event.requestExtraMessageData[
      cast.games.superterran.SuperterranGame.GRAVITY_FIELD_];
  var playerField = event.requestExtraMessageData[cast.games.superterran.SuperterranGame.PLAYER_NAME];
  this.onPlayerMessage_(player, moveField ? parseFloat(moveField) : 0, !!boostField, !!gravityField, playerField);
};


/**
 * Handles incoming player messages.
 * @param {!cast.receiver.games.PlayerInfo} player
 * @param {boolean} fire If true, fires a bullet and ignores move parameter.
 *     Otherwise, bullet is not fired, and move parameter will be used.
 * @param {number} move Only used if fire parameter is true.
 * @private
 */
cast.games.superterran.SuperterranGame.prototype.onPlayerMessage_ =
    function(player, move, boost, gravity, playerField) {

  if (boost) {
    playerData = this.gameManager_.getPlayer(player.playerId)["playerData"];
    playerData["boost"] = this.BOOST_FACTOR_;
    this.gameManager_.updatePlayerData(player.playerId, playerData);
  } else if (playerField) {
    playerData = this.gameManager_.getPlayer(player.playerId)["playerData"];
    playerData["playerName"] = playerField;
    this.gameManager_.updatePlayerData(player.playerId, playerData);
  } else if (gravity) {
    for (var otherPlayerId in this.playerMap_) {
      if (this.playerMap_.hasOwnProperty(otherPlayerId) && otherPlayerId != player.playerId) {
        otherPlayerData = this.gameManager_.getPlayer(otherPlayerId)["playerData"];
        otherPlayerData["boost"] = 0;
        this.gameManager_.updatePlayerData(otherPlayerId, otherPlayerData);
      }
    }
  } else {

    var degree = (((move-180)/180)%360)*Math.PI;

    var x = Math.sin(degree) * this.MAX_PLAYER_ACCEL_;
    var y = Math.cos(degree) * this.MAX_PLAYER_ACCEL_;

    playerData = this.gameManager_.getPlayer(player.playerId)["playerData"];
    playerData["vel_y"] = this.getInBoundValue_(playerData["vel_y"] + y, -1*this.MAX_PLAYER_SPEED_, this.MAX_PLAYER_SPEED_);
    playerData["vel_x"] = this.getInBoundValue_(playerData["vel_x"] - x, -1*this.MAX_PLAYER_SPEED_, this.MAX_PLAYER_SPEED_);
    this.gameManager_.updatePlayerData(player.playerId, playerData);
  }
};


/**
 * Updates enemy position. Uses #loopIterator_[0] to select enemy to move.
 * @private
 */
cast.games.superterran.SuperterranGame.prototype.updatePlayer_ = function() {
  var index = this.loopIterator_[0];
  var playerSprite = this.players_[index];
  var playerData = this.gameManager_.getPlayer(this.playerIdMap_[index])["playerData"];

  // The position is calculated with the ship sprite's dimensions taken into
  // account so the ship will not be rendered out of canvas bounds.
  // Note: Sprites are rendered with the center of the sprite at the desired
  // location hence the texture height / 2 compensation.
  var spriteVerticalRange = this.canvasHeight_ - playerSprite.height/2;
  var spriteHorizontalRange = this.canvasWidth_ - playerSprite.width/2;
  playerSprite.position.y = this.getInBoundValue_(playerSprite.position.y + (playerData["vel_y"] * playerData["boost"]), playerSprite.height / 2, spriteVerticalRange);
  playerSprite.position.x = this.getInBoundValue_(playerSprite.position.x + (playerData["vel_x"] * playerData["boost"]),  playerSprite.width / 2,  spriteHorizontalRange);

  if (playerData["boost"] > 1) {
    playerData["boost"] = Math.max(1, playerData["boost"] - this.BOOST_DECAY_);
    this.gameManager_.updatePlayerData(this.playerIdMap_[index], playerData);
  } else if (playerData["boost"] < 1) {
    playerData["boost"] = Math.min(1, playerData["boost"] + this.BOOST_RECOVER_);
    this.gameManager_.updatePlayerData(this.playerIdMap_[index], playerData);
  }
};


/**
 * Updates enemy position. Uses #loopIterator_[0] to select enemy to move.
 * @private
 */
cast.games.superterran.SuperterranGame.prototype.updateEnemy_ = function() {
  var index = this.loopIterator_[0];
  var enemy = this.enemies_[index];

  // If enemy is behind screen
  if (enemy.position.x < -(enemy.texture.width)) {
    // Move enemy to a random position on the right portion of the screen
    enemy.position.x = this.canvasWidth_ + Math.random() * this.canvasWidth_;

    var spriteVerticalRange = this.canvasHeight_ - enemy.texture.height;
    enemy.position.y = (Math.random() * spriteVerticalRange) +
            enemy.texture.height / 2;

    this.enemySpeeds_[index] = Math.floor(Math.random() * (this.MAX_SPEED_ -
        this.MIN_SPEED_ + 1)) + this.MIN_SPEED_;
    enemy.animationSpeed = Math.random();
    enemy.tint = Math.random() * 0xffffff;
    enemy.play();
  } else {
    enemy.position.x -= this.enemySpeeds_[index];
    for (this.loopIterator_[1] = 0; this.loopIterator_[1] < this.MAX_PLAYERS_;
        this.loopIterator_[1]++) {
      var player = this.players_[this.loopIterator_[1]];

      if (!player.visible) {
        continue;
      }

      if (this.willCollide_(enemy, player)) {
        this.showExplosion_(enemy);
        enemy.visible = false;
        enemy.position.x = -(enemy.texture.width +
                this.DISPLAY_BORDER_BUFFER_WIDTH_);
        //UPDATE PLAYER SIZE
        var playerIndex = this.playerIdMap_[this.loopIterator_[1]];
        var playerData = this.gameManager_.getPlayer(playerIndex)["playerData"];
        playerData["mass"] += 1;

        if(playerData["mass"] >= this.WINNING_SCORE_) {
          this.winningMsg = new PIXI.Text("You Are Winner: " + playerData['playerName'], {font:"50px Arial", fill:"red"});
          this.restartGame_();
          return;
        }

        player.height += 7;
        player.width += 7;
        this.gameManager_.updatePlayerData(playerIndex, playerData);
        return;
      }
    }
    enemy.visible = true;
  }
};

/**
 * Updates bullet position. Uses #loopIterator_[0] to select bullet to move.
 * @private
 */
cast.games.superterran.SuperterranGame.prototype.updateBullet_ = function() {
  var bullet = this.playerBullets_[this.loopIterator_[0]];

  if (bullet.position.x > this.canvasWidth_) {
    bullet.visible = false;
  }

  if (!bullet.visible) {
    return;
  }

  bullet.position.x += this.BULLET_SPEED_;

  for (var i = 0; i < this.MAX_ENEMIES_; i++) {
    var enemy = this.enemies_[i];
    if (this.willCollide_(bullet, enemy)) {
      this.showExplosion_(bullet);
      bullet.visible = false;
      enemy.visible = false;
      enemy.position.x = -(enemy.texture.width +
              this.DISPLAY_BORDER_BUFFER_WIDTH_);
    }
  }
};


/**
 * Returns true if sprite1 collides with sprite2.
 * @param {!PIXI.Sprite} sprite1
 * @param {!PIXI.Sprite} sprite2
 * @return {boolean} True if sprite1 collides with sprite2.
 * @private
 */
cast.games.superterran.SuperterranGame.prototype.willCollide_ =
    function(sprite1, sprite2) {
  var sprite1HalfWidth = sprite1.width / 2;
  var sprite2HalfWidth = sprite2.width / 2;

  var left1 = sprite1.position.x - sprite1HalfWidth;
  var right2 = sprite2.position.x + sprite2HalfWidth;

  if (left1 > right2) {
    return false;
  }

  var left2 = sprite2.position.x - sprite2HalfWidth;
  var right1 = sprite1.position.x + sprite1HalfWidth;
  if (left2 > right1) {
    return false;
  }

  var sprite1HalfHeight = sprite1.height / 2;
  var sprite2HalfHeight = sprite2.height / 2;

  var top1 = sprite1.position.y - sprite1HalfHeight;
  var bottom2 = sprite2.position.y + sprite2HalfHeight;
  if (top1 > bottom2) {
    return false;
  }

  var bottom1 = sprite1.position.y + sprite1HalfHeight;
  var top2 = sprite2.position.y - sprite2HalfHeight;
  if (top2 > bottom1) {
    return false;
  }

  return true;
};

/**
 * Shows explosion at sprite.
 * @param {!PIXI.Sprite} sprite
 * @private
 */
cast.games.superterran.SuperterranGame.prototype.showExplosion_ = function(sprite) {
  for (var i = 0; i < this.MAX_EXPLOSIONS_; i++) {
    var explosion = this.explosions_[i];
    if (!explosion.visible) {
      explosion.position.x = sprite.position.x;
      explosion.position.y = sprite.position.y;
      explosion.visible = true;
      explosion.gotoAndPlay(0);
      return;
    }
  }
};

/**
 * Callback to hide explosion.
 * @param {!PIXI.extras.MovieClip} explosion
 * @private
 */
cast.games.superterran.SuperterranGame.prototype.hideExplosion_ =
    function(explosion) {
  explosion.visible = false;
};

/**
 * Fires bullet.
 * @param {!PIXI.Sprite} player The player sprite firing the bullet.
 * @private
 */
cast.games.superterran.SuperterranGame.prototype.fireBullet_ = function(player) {
  for (var i = 0; i < this.MAX_PLAYER_BULLETS_; i++) {
    var bullet = this.playerBullets_[i];
    if (!bullet.visible) {
      bullet.position.x = player.position.x;
      bullet.position.y = player.position.y;
      bullet.visible = true;
      return;
    }
  }
};

cast.games.superterran.SuperterranGame.prototype.getInBoundValue_ = function(position, min, max) {
  if (position > max) {
      return max;
  } else if (position < min) {
      return min;
  }
  return position;
};