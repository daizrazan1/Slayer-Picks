function createEspnImportScript(appOrigin: string, shortcutMode: boolean): string {
  return `(function(){
    var appOrigin=${JSON.stringify(appOrigin)};
    var shortcutMode=${shortcutMode};
    var completed=false;
    function finish(message){
      if(!shortcutMode||completed)return;
      completed=true;
      if(typeof completion==='function')completion(message);
    }
    if(location.hostname!=='fantasy.espn.com'){
      var wrongSite='Open a fantasy.espn.com league page in Safari first.';
      if(shortcutMode)finish(wrongSite);else alert(wrongSite);
      return;
    }
    var path=location.pathname;
    var gid=path.includes('basketball')?'fba':path.includes('baseball')?'flb':path.includes('hockey')?'fhl':'ffl';
    var sports={fba:'basketball',ffl:'football',flb:'baseball',fhl:'hockey'};
    var params=new URLSearchParams(location.search);
    var lid=Number(params.get('leagueId'));
    var teamId=Number(params.get('teamId'));
    if(!lid){
      var noLeague='Open your ESPN Fantasy league page first. Its URL must include leagueId.';
      if(shortcutMode)finish(noLeague);else alert(noLeague);
      return;
    }
    var now=new Date(),mo=now.getMonth(),cy=now.getFullYear();
    var fallbackYear=(gid==='fba'||gid==='fhl')?(mo>=9?cy+1:cy):(gid==='ffl')?(mo>=7?cy:cy-1):cy;
    var year=Number(params.get('seasonId'))||fallbackYear;
    var target=window.open(appOrigin+'/sync?incoming=espn','_blank');
    if(!target){
      var noPopup='Allow pop-ups for ESPN in Safari, then try ESPN Sync again.';
      if(shortcutMode)finish(noPopup);else alert(noPopup);
      return;
    }
    var ready=false,leagueData=null,waiverData=null,waiverError=null,fetched=false,sent=false;
    function deliver(){
      if(!ready||!fetched||!leagueData||sent)return;
      sent=true;
      target.postMessage({type:'slayer-picks-espn-data',espnData:leagueData,waiverData:waiverData,waiverError:waiverError,sport:sports[gid],leagueId:lid,teamId:teamId},appOrigin);
      target.focus();
      window.removeEventListener('message',onMessage);
      finish('ESPN data sent to Slayer Picks. Check the new tab for the import result.');
    }
    function onMessage(event){
      if(event.origin!==appOrigin||event.source!==target||!event.data||event.data.type!=='slayer-picks-ready')return;
      ready=true;deliver();
    }
    window.addEventListener('message',onMessage);
    setTimeout(function(){
      if(!sent){
        window.removeEventListener('message',onMessage);
        var noApp='Could not open Slayer Picks. Sign in at '+appOrigin+' in Safari, then try again.';
        if(shortcutMode)finish(noApp);else alert(noApp);
      }
    },30000);
    var hosts=['https://fantasy.espn.com','https://lm-api-reads.fantasy.espn.com'];
    async function fetchLeague(){
      var views=['?view=mTeam&view=mRoster&view=mSettings&view=mMatchup&view=mMatchupScore','?view=mTeam&view=mRoster&view=mSettings'];
      for(var v=0;v<views.length;v++){
        for(var i=0;i<hosts.length;i++){
          try{
            var url=hosts[i]+'/apis/v3/games/'+gid+'/seasons/'+year+'/segments/0/leagues/'+lid+views[v];
            var response=await fetch(url,{credentials:'include',headers:{Accept:'application/json'}});
            if(!response.ok)continue;
            return await response.json();
          }catch(error){}
        }
      }
      throw new Error('league');
    }
    async function fetchWaivers(){
      var filter={players:{filterStatus:{value:['FREEAGENT','WAIVERS']},limit:200,offset:0,sortPercOwned:{sortPriority:1,sortAsc:false}}};
      for(var i=0;i<hosts.length;i++){
        try{
          var url=hosts[i]+'/apis/v3/games/'+gid+'/seasons/'+year+'/segments/0/leagues/'+lid+'?view=kona_player_info';
          var response=await fetch(url,{credentials:'include',headers:{Accept:'application/json','X-Fantasy-Filter':JSON.stringify(filter)}});
          if(!response.ok)continue;
          var data=await response.json();
          if(Array.isArray(data.players))return data.players;
        }catch(error){}
      }
      throw new Error('players');
    }
    (async function(){
      var results=await Promise.allSettled([fetchLeague(),fetchWaivers()]);
      if(results[0].status==='fulfilled')leagueData=results[0].value;
      if(results[1].status==='fulfilled')waiverData=results[1].value;
      else waiverError='ESPN did not return available players. Your rosters can still sync.';
      fetched=true;deliver();
      if(leagueData)return;
      window.removeEventListener('message',onMessage);
      var noData='ESPN could not provide this league. Sign in to ESPN and open the correct league page.';
      if(shortcutMode)finish(noData);else alert(noData);
    })();
  })();`;
}

export function createEspnBookmarklet(appOrigin: string): string {
  return `javascript:${createEspnImportScript(appOrigin, false)}`;
}

export function createEspnSafariShortcut(appOrigin: string): string {
  return createEspnImportScript(appOrigin, true);
}
